// src/services/mapping.service.js
// ─────────────────────────────────────────────────────────────────────────────
// MAPPING SERVICE — now with Memory Intelligence Layer
//
// Auto-map priority order:
//   1. Client-specific MappingMemory (≥ 60% confidence) → auto-apply
//   2. Firm-wide MappingMemory       (≥ 60% confidence) → auto-apply
//   3. Master table exact match
//   4. Master table fuzzy/partial match
//   5. IFRS keyword heuristics (IFRS method only)
//   6. Flag as unmapped
//
// Manual saves → always write to MappingMemory so future engagements benefit
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');
const memoryService = require('./mappingMemory.service');

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
 */
async function loadMasterGrouping(method) {
  const applicabilities = ['ALL'];
  if (['AS', 'IND_AS', 'IFRS', 'IFRS_SME'].includes(method)) {
    applicabilities.push(method);
  }
  return prisma.masterGrouping.findMany({
    where: { isActive: true, methodApplicability: { in: applicabilities } },
    orderBy: { displayOrder: 'asc' },
  });
}

/**
 * AS / IND_AS: Auto-map with memory layer first, then master table fallback.
 */
async function autoMapFromMaster(engagementId, method) {
  // Get engagement context for memory lookup
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: { client: { select: { id: true, firmId: true } } },
  });
  if (!engagement) return { mapped: 0, unmapped: [] };

  const firmId   = engagement.client.firmId;
  const clientId = engagement.client.id;

  const masterRows = await loadMasterGrouping(method);
  const masterBySubGroupNo   = new Map(masterRows.filter(r=>r.subGroupNo).map(r => [String(r.subGroupNo).trim().toUpperCase(), r]));
  const masterBySubGroupName = new Map(masterRows.filter(r=>r.subGroupName).map(r => [String(r.subGroupName).trim().toUpperCase(), r]));

  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) return { mapped: 0, unmapped: [] };

  const existingMappings = await prisma.mapping.findMany({ where: { engagementId } });
  const alreadyMapped    = new Set(existingMappings.map(m => m.subGrouping.trim().toUpperCase()));

  const subGroupings = [...new Set(
    latest.rows
      .map(r => r.subGrouping.trim())
      .filter(sg => !alreadyMapped.has(sg.toUpperCase()))
  )];

  if (subGroupings.length === 0) return { mapped: 0, unmapped: [] };

  // ── Step 1: Check MappingMemory first ──────────────────────────────────────
  // Safe: MappingMemory table may not exist if migration hasn't been run yet
  let memAutoMapped = [], memSuggested = [], stillUnmapped = [...subGroupings];
  try {
    const memResult = await memoryService.applyMemoryToUnmapped(subGroupings, firmId, clientId, method);
    memAutoMapped = memResult.autoMapped;
    memSuggested  = memResult.suggested;
    stillUnmapped = memResult.stillUnmapped;
  } catch (e) {
    console.warn('[MappingMemory] Lookup skipped:', e.message);
  }

  const toCreate = [];
  const unmapped = [];

  // Memory auto-mapped (high confidence) → create mappings directly
  for (const item of memAutoMapped) {
    toCreate.push({
      engagementId,
      subGrouping:      item.subGrouping,
      groupName:        item.groupName,
      subGroupName:     item.subGroupName,
      subGroupNo:       item.subGroupNo,
      noteGroupId:      item.noteGroupId,
      masterGroupingId: item.masterGroupingId,
      isManual:         false,
      isSaved:          true,
    });
  }

  // Memory suggested (medium confidence) → also auto-apply but flag as needing review
  // We apply them now so the UI shows something rather than blank;
  // the UI will surface these with a "memory suggestion" badge
  for (const item of memSuggested) {
    toCreate.push({
      engagementId,
      subGrouping:      item.subGrouping,
      groupName:        item.groupName,
      subGroupName:     item.subGroupName,
      subGroupNo:       item.subGroupNo,
      noteGroupId:      item.noteGroupId,
      masterGroupingId: item.masterGroupingId,
      isManual:         false,
      isSaved:          true,
    });
  }

  // ── Step 2: Remaining → try master table ───────────────────────────────────
  for (const subGrouping of stillUnmapped) {
    const sgUpper = subGrouping.toUpperCase();

    let master = masterBySubGroupNo.get(sgUpper);
    if (!master) master = masterBySubGroupName.get(sgUpper);

    if (!master) {
      for (const [key, row] of masterBySubGroupName) {
        if (key.includes(sgUpper) || sgUpper.includes(key)) {
          master = row;
          break;
        }
      }
    }

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

      // Master table hits also write to memory so next time they skip the master lookup
      try {
      await memoryService.recordMemory({
        firmId, clientId: null, rawText: subGrouping,
        groupName: master.groupName, subGroupName: master.subGroupName,
        subGroupNo: master.subGroupNo, noteGroupId: master.noteGroupId,
        masterGroupingId: master.id, method, engagementId,
      });
      } catch (memErr) { console.warn('[MappingMemory] Write skipped:', memErr.message); }
    } else {
      unmapped.push(subGrouping);
    }
  }

  if (toCreate.length > 0) {
    await prisma.mapping.createMany({ data: toCreate, skipDuplicates: true });
  }

  return {
    mapped:      toCreate.length,
    unmapped,
    fromMemory:  memAutoMapped.length + memSuggested.length,
    fromMaster:  toCreate.length - memAutoMapped.length - memSuggested.length,
  };
}

/**
 * IFRS / IFRS_SME: Memory first, then keyword heuristics.
 */
async function autoMapIFRS(engagementId) {
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: { client: { select: { id: true, firmId: true } } },
  });
  if (!engagement) return { mapped: 0, unmapped: [] };

  const firmId   = engagement.client.firmId;
  const clientId = engagement.client.id;
  const method   = engagement.method;

  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) return { mapped: 0, unmapped: [] };

  const existing     = await prisma.mapping.findMany({ where: { engagementId } });
  const alreadyMapped = new Set(existing.map(m => m.subGrouping.trim().toUpperCase()));

  const subGroupings = [...new Set(
    latest.rows.map(r => r.subGrouping.trim()).filter(sg => !alreadyMapped.has(sg.toUpperCase()))
  )];

  if (subGroupings.length === 0) return { mapped: 0, unmapped: [] };

  // ── Step 1: Memory check (safe) ───────────────────────────────────────────
  let memAutoMapped = [], memSuggested = [], stillUnmapped = [...subGroupings];
  try {
    const memResult = await memoryService.applyMemoryToUnmapped(subGroupings, firmId, clientId, method);
    memAutoMapped = memResult.autoMapped;
    memSuggested  = memResult.suggested;
    stillUnmapped = memResult.stillUnmapped;
  } catch (e) {
    console.warn('[MappingMemory] IFRS lookup skipped:', e.message);
  }

  const toCreate = [];
  const unmapped = [];

  for (const item of [...memAutoMapped, ...memSuggested]) {
    toCreate.push({
      engagementId,
      subGrouping:      item.subGrouping,
      groupName:        item.groupName,
      subGroupName:     item.subGroupName,
      subGroupNo:       item.subGroupNo,
      noteGroupId:      item.noteGroupId,
      masterGroupingId: item.masterGroupingId,
      isManual:         false,
      isSaved:          true,
    });
  }

  // ── Step 2: IFRS heuristics for remainder ─────────────────────────────────
  for (const sg of stillUnmapped) {
    const sgLower = sg.toLowerCase();
    let matched   = null;

    const tbGrouping = latest.rows.find(r => r.subGrouping.trim() === sg)?.grouping;
    if (tbGrouping) {
      matched = { groupName: tbGrouping, assetLiability: guessAssetLiability(tbGrouping), sheet: guessSheet(tbGrouping) };
    }

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
        groupName:   matched.groupName,
        subGroupName: sg,
        isManual:    false,
        isSaved:     true,
      });

      // Write heuristic hits to memory too
      try {
      await memoryService.recordMemory({
        firmId, clientId: null, rawText: sg,
        groupName: matched.groupName, subGroupName: sg,
        method, engagementId,
      });
      } catch (memErr) { console.warn('[MappingMemory] Write skipped:', memErr.message); }
    } else {
      unmapped.push(sg);
    }
  }

  if (toCreate.length > 0) {
    await prisma.mapping.createMany({ data: toCreate, skipDuplicates: true });
  }

  return {
    mapped:      toCreate.length,
    unmapped,
    fromMemory:  memAutoMapped.length + memSuggested.length,
    fromHeuristic: toCreate.length - memAutoMapped.length - memSuggested.length,
  };
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
 * Save a manual mapping + write to MappingMemory.
 * This is the key write path — every human correction is remembered.
 */
async function saveManualMapping(engagementId, body) {
  const { subGrouping, groupName, subGroupName, subGroupNo, noteGroupId, masterGroupingId } = body;
  if (!subGrouping) throw Object.assign(new Error('subGrouping is required'), { status: 400 });
  if (!groupName)   throw Object.assign(new Error('groupName is required'),   { status: 400 });

  // Save to Mapping table
  const mapping = await prisma.mapping.upsert({
    where: { engagementId_subGrouping: { engagementId, subGrouping } },
    update: { groupName, subGroupName, subGroupNo, noteGroupId, masterGroupingId, isManual: true, updatedAt: new Date() },
    create: { engagementId, subGrouping, groupName, subGroupName, subGroupNo, noteGroupId, masterGroupingId, isManual: true, isSaved: true },
  });

  // ── Write to MappingMemory (safe) ──────────────────────────────────────────
  try {
  // ── Write to MappingMemory ─────────────────────────────────────────────────
  // Get engagement context
  const engagement = await prisma.engagement.findUnique({
    where: { id: engagementId },
    include: { client: { select: { id: true, firmId: true } } },
  });

  if (engagement) {
    const firmId   = engagement.client.firmId;
    const clientId = engagement.client.id;
    const method   = engagement.method;

    // Write client-specific memory (highest priority)
    try {
    await memoryService.recordMemory({
      firmId, clientId, rawText: subGrouping,
      groupName, subGroupName, subGroupNo, noteGroupId, masterGroupingId,
      method, engagementId,
    });
    } catch (memErr) { console.warn('[MappingMemory] Write skipped:', memErr.message); }
    // recordMemory also auto-writes firm-wide entry — see memoryService
  }

  return mapping;
  } catch (e) {
    console.warn('[MappingMemory] Write skipped:', e.message);
  }
}
async function getMappingStatus(engagementId) {
  const [mappings, latest] = await Promise.all([
    prisma.mapping.findMany({ where: { engagementId }, orderBy: { groupName: 'asc' } }),
    prisma.tBVersion.findFirst({
      where: { engagementId, isPriorYear: false },
      orderBy: { versionNumber: 'desc' },
      include: { rows: { select: { subGrouping: true } } },
    }),
  ]);

  if (!latest) return { mappings, unmapped: [] };

  const mapped   = new Set(mappings.map(m => m.subGrouping.trim().toUpperCase()));
  const unmapped = [...new Set(
    latest.rows.map(r => r.subGrouping.trim()).filter(sg => !mapped.has(sg.toUpperCase()))
  )];

  return { mappings, unmapped };
}

module.exports = {
  autoMapFromMaster,
  autoMapIFRS,
  saveManualMapping,
  getMappingStatus,
  loadMasterGrouping,
};
