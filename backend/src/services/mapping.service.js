// src/services/mapping.service.js
// ─────────────────────────────────────────────────────────────────────────────
// MAPPING SERVICE
//
// AS METHOD:
//   - Loads master grouping table filtered by method_applicability IN (ALL, AS)
//   - Auto-maps TB.subGrouping → master row via exact match
//   - Falls back to TB.grouping if present
//
// IND AS METHOD:
//   - Uses same master table filtered by (ALL, IND_AS)
//   - Includes OCI, SOCE, Financial instruments rows
//
// IFRS / IFRS SME:
//   - No master table used
//   - Auto-groups by keyword heuristics
//   - User manually assigns FS heads via UI
//   - Saved mappings are reused across versions
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');

// Keywords for IFRS dynamic auto-grouping heuristics
const IFRS_HEURISTICS = [
  { keywords: ['property', 'plant', 'equipment', 'ppe', 'machinery', 'building', 'furniture'], groupName: 'Property, Plant and Equipment', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['intangible', 'goodwill', 'patent', 'trademark', 'software'], groupName: 'Intangible Assets', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['investment', 'mutual fund', 'equity instrument', 'bond'], groupName: 'Financial Assets - Investments', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['receivable', 'debtor', 'trade receivable'], groupName: 'Trade and Other Receivables', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['inventory', 'stock', 'goods', 'wip', 'work in progress'], groupName: 'Inventories', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['cash', 'bank', 'deposit', 'petty cash'], groupName: 'Cash and Cash Equivalents', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['prepaid', 'advance', 'loan given'], groupName: 'Prepayments and Other Current Assets', assetLiability: 'Assets', sheet: 'BS' },
  { keywords: ['share capital', 'equity share'], groupName: 'Share Capital', assetLiability: 'Equity', sheet: 'BS' },
  { keywords: ['reserve', 'retained earnings', 'surplus', 'profit brought'], groupName: 'Retained Earnings and Other Reserves', assetLiability: 'Equity', sheet: 'BS' },
  { keywords: ['borrowing', 'loan taken', 'term loan', 'debenture', 'ncd'], groupName: 'Borrowings', assetLiability: 'Liabilities', sheet: 'BS' },
  { keywords: ['trade payable', 'creditor', 'sundry creditor', 'accounts payable'], groupName: 'Trade and Other Payables', assetLiability: 'Liabilities', sheet: 'BS' },
  { keywords: ['provision', 'gratuity', 'leave encashment'], groupName: 'Provisions', assetLiability: 'Liabilities', sheet: 'BS' },
  { keywords: ['tax liability', 'income tax payable', 'deferred tax'], groupName: 'Income Tax Liabilities', assetLiability: 'Liabilities', sheet: 'BS' },
  { keywords: ['revenue', 'sales', 'turnover', 'income from operations'], groupName: 'Revenue from Contracts with Customers', assetLiability: 'Income', sheet: 'PL' },
  { keywords: ['other income', 'interest income', 'dividend', 'gain'], groupName: 'Other Income', assetLiability: 'Income', sheet: 'PL' },
  { keywords: ['material', 'purchase', 'cost of goods', 'cogs', 'raw material'], groupName: 'Cost of Materials / Cost of Sales', assetLiability: 'Expenses', sheet: 'PL' },
  { keywords: ['salary', 'wages', 'employee', 'staff', 'payroll', 'pf', 'esic'], groupName: 'Employee Benefit Expenses', assetLiability: 'Expenses', sheet: 'PL' },
  { keywords: ['depreciation', 'amortisation', 'amortization'], groupName: 'Depreciation and Amortisation', assetLiability: 'Expenses', sheet: 'PL' },
  { keywords: ['interest expense', 'finance cost', 'borrowing cost'], groupName: 'Finance Costs', assetLiability: 'Expenses', sheet: 'PL' },
  { keywords: ['tax expense', 'income tax expense', 'deferred tax expense'], groupName: 'Income Tax Expense', assetLiability: 'Expenses', sheet: 'PL' },
  { keywords: ['oci', 'other comprehensive', 'actuarial', 'fair value reserve'], groupName: 'Other Comprehensive Income', assetLiability: 'Income', sheet: 'OCI' },
];

/**
 * Load master grouping rows applicable for the given method.
 * Unified for AS + IND_AS via method_applicability column.
 */
async function loadMasterGrouping(method) {
  const applicabilities = ['ALL'];
  if (['AS', 'IND_AS', 'IFRS', 'IFRS_SME'].includes(method)) {
    applicabilities.push(method);
  }

  return prisma.masterGrouping.findMany({
    where: {
      isActive: true,
      methodApplicability: { in: applicabilities },
    },
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * AS / IND_AS: Auto-map TB subGroupings to master rows.
 * Creates Mapping records for any unmapped subGroupings.
 *
 * @param {string} engagementId
 * @param {string} method  — 'AS' | 'IND_AS'
 */
async function autoMapFromMaster(engagementId, method) {
  const masterRows = await loadMasterGrouping(method);
  // Index by subGroupNo (exact) and subGroupName (fuzzy fallback)
  const masterBySubGroupNo   = new Map(masterRows.map(r => [r.subGroupNo.trim().toUpperCase(), r]));
  const masterBySubGroupName = new Map(masterRows.map(r => [r.subGroupName.trim().toUpperCase(), r]));

  // Get latest TB rows
  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) return { mapped: 0, unmapped: [] };

  // Get already-mapped subGroupings
  const existingMappings = await prisma.mapping.findMany({ where: { engagementId } });
  const alreadyMapped = new Set(existingMappings.map(m => m.subGrouping.trim().toUpperCase()));

  // Unique subGroupings not yet mapped
  const subGroupings = [...new Set(
    latest.rows
      .map(r => r.subGrouping.trim())
      .filter(sg => !alreadyMapped.has(sg.toUpperCase()))
  )];

  const toCreate = [];
  const unmapped = [];

  for (const subGrouping of subGroupings) {
    const sgUpper = subGrouping.toUpperCase();

    // 1. Try exact match on subGroupNo
    let master = masterBySubGroupNo.get(sgUpper);

    // 2. Try exact match on subGroupName
    if (!master) master = masterBySubGroupName.get(sgUpper);

    // 3. Try partial match on subGroupName
    if (!master) {
      for (const [key, row] of masterBySubGroupName) {
        if (key.includes(sgUpper) || sgUpper.includes(key)) {
          master = row;
          break;
        }
      }
    }

    // 4. Fall back to TB.grouping if present in TB rows
    if (!master) {
      const tbGrouping = latest.rows.find(r => r.subGrouping.trim() === subGrouping)?.grouping;
      if (tbGrouping) {
        for (const [, row] of masterBySubGroupName) {
          if (row.groupName.toUpperCase() === tbGrouping.trim().toUpperCase()) {
            master = row;
            break;
          }
        }
      }
    }

    if (master) {
      toCreate.push({
        engagementId,
        subGrouping,
        groupName:        master.groupName,
        subGroupName:     master.subGroupName,
        subGroupNo:       master.subGroupNo,
        noteGroupId:      master.noteGroupId,
        masterGroupingId: master.id,
        isManual:         false,
        isSaved:          true,
      });
    } else {
      unmapped.push(subGrouping);
    }
  }

  if (toCreate.length > 0) {
    await prisma.mapping.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { mapped: toCreate.length, unmapped };
}

/**
 * IFRS / IFRS_SME: Auto-group by keyword heuristics.
 * Creates Mapping records; user can override via UI later.
 */
async function autoMapIFRS(engagementId) {
  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) return { mapped: 0, unmapped: [] };

  const existing = await prisma.mapping.findMany({ where: { engagementId } });
  const alreadyMapped = new Set(existing.map(m => m.subGrouping.trim().toUpperCase()));

  const subGroupings = [...new Set(
    latest.rows.map(r => r.subGrouping.trim()).filter(sg => !alreadyMapped.has(sg.toUpperCase()))
  )];

  const toCreate = [];
  const unmapped = [];

  for (const sg of subGroupings) {
    const sgLower = sg.toLowerCase();
    let matched = null;

    // Check TB.grouping first (user might have provided it)
    const tbGrouping = latest.rows.find(r => r.subGrouping.trim() === sg)?.grouping;
    if (tbGrouping) {
      matched = { groupName: tbGrouping, assetLiability: guessAssetLiability(tbGrouping), sheet: guessSheet(tbGrouping) };
    }

    // Keyword heuristic fallback
    if (!matched) {
      for (const rule of IFRS_HEURISTICS) {
        if (rule.keywords.some(kw => sgLower.includes(kw))) {
          matched = rule;
          break;
        }
      }
    }

    if (matched) {
      toCreate.push({
        engagementId,
        subGrouping: sg,
        groupName: matched.groupName,
        subGroupName: sg,
        isManual: false,
        isSaved: true,
      });
    } else {
      unmapped.push(sg);
    }
  }

  if (toCreate.length > 0) {
    await prisma.mapping.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { mapped: toCreate.length, unmapped };
}

function guessAssetLiability(text) {
  const t = text.toLowerCase();
  if (['asset', 'receivable', 'cash', 'inventory', 'prepaid'].some(k => t.includes(k))) return 'Assets';
  if (['liability', 'payable', 'borrowing', 'provision'].some(k => t.includes(k))) return 'Liabilities';
  if (['income', 'revenue', 'gain'].some(k => t.includes(k))) return 'Income';
  return 'Expenses';
}

function guessSheet(text) {
  const t = text.toLowerCase();
  if (['revenue', 'income', 'expense', 'cost', 'depreciation', 'salary'].some(k => t.includes(k))) return 'PL';
  return 'BS';
}

/**
 * Save a single manual mapping override (user assignment via UI)
 */
async function saveManualMapping(engagementId, body) {
  // body = { subGrouping, groupName, subGroupName, subGroupNo, noteGroupId, masterGroupingId }
  const { subGrouping, ...data } = body;
  if (!subGrouping) throw Object.assign(new Error('subGrouping is required'), { status: 400 });
  return prisma.mapping.upsert({
    where: { engagementId_subGrouping: { engagementId, subGrouping } },
    update: { ...data, isManual: true, updatedAt: new Date() },
    create: { engagementId, subGrouping, ...data, isManual: true, isSaved: true },
  });
}

/**
 * Get all mappings for an engagement (including unmapped TB subGroupings)
 */
async function getMappingStatus(engagementId) {
  const [mappings, latest] = await Promise.all([
    prisma.mapping.findMany({ where: { engagementId }, orderBy: { groupName: 'asc' } }),
    prisma.tBVersion.findFirst({
      where: { engagementId },
      orderBy: { versionNumber: 'desc' },
      include: { rows: { select: { subGrouping: true } } },
    }),
  ]);

  if (!latest) return { mappings, unmapped: [] };

  const mapped = new Set(mappings.map(m => m.subGrouping.trim().toUpperCase()));
  const unmapped = [...new Set(
    latest.rows.map(r => r.subGrouping.trim()).filter(sg => !mapped.has(sg.toUpperCase()))
  )];

  return { mappings, unmapped };
}

module.exports = { autoMapFromMaster, autoMapIFRS, saveManualMapping, getMappingStatus, loadMasterGrouping };
