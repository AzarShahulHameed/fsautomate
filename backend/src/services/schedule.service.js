// src/services/schedule.service.js
// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE SERVICE — TB-to-Schedule Data Bridge
//
// MNC architecture principle:
//   The TB/FSLine is the single source of truth for ALL closing balances.
//   Schedules capture movements (opening → additions → disposals → closing).
//   The closing derived from movements MUST equal the FSLine closing amount.
//   Any difference is flagged as a reconciliation error.
//
// This service provides:
//   1. getScheduleAnchors(engagementId) — reads FSLine and returns expected
//      closing balances for every schedule type, keyed by schedule name.
//      Called by every schedule GET endpoint to enrich the response.
//
//   2. getPYOpeningBalances(engagementId) — reads PY FSLines and returns
//      opening balance anchors for current year schedules.
//      PY closing = CY opening. This pre-populates opening columns.
//
//   3. getScheduleCastingErrors(engagementId) — runs casting checks between
//      schedule closing totals and FSLine amounts. Called by validation service.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { prisma } = require('../config/db');

// ── Schedule anchor definitions ───────────────────────────────────────────────
// Maps each schedule type to the FSLine groupNames or noteGroupIds that anchor it.
// When multiple FSLine rows contribute (e.g. PPE has Tangible + Intangible),
// their totalFinalNet values are summed.
//
// Priority: noteGroupId match first, groupName keyword match as fallback.
const SCHEDULE_ANCHORS = {
  ppe: {
    label: 'Property, Plant and Equipment',
    // PPE may be mapped to various groupNames — we use keyword matching on FSLine
    groupNameKeywords: [
      'property, plant', 'property plant', 'plant and equipment',
      'fixed asset', 'tangible asset', 'ppe',
      'furniture', 'vehicle', 'machinery', 'equipment', 'building', 'land',
      'right-of-use', 'right of use', 'rou asset',
      'capital work in progress', 'cwip',
    ],
    sheet: 'BS',
    assetLiability: 'Assets',
  },
  intangibles: {
    label: 'Intangible Assets',
    groupNameKeywords: [
      'intangible', 'goodwill', 'software', 'trademark', 'patent',
      'brand', 'copyright', 'license', 'franchise', 'customer relationship',
    ],
    sheet: 'BS',
    assetLiability: 'Assets',
  },
  dta: {
    label: 'Deferred Tax Asset',
    noteGroupIds: ['NG-DTA'],
    groupNameKeywords: ['deferred tax asset'],
    sheet: 'BS',
    assetLiability: 'Assets',
  },
  dtl: {
    label: 'Deferred Tax Liability',
    noteGroupIds: ['NG-DTL'],
    groupNameKeywords: ['deferred tax liability', 'deferred tax liab'],
    sheet: 'BS',
    assetLiability: 'Liabilities',
  },
  depreciation: {
    label: 'Depreciation and Amortisation Expense',
    noteGroupIds: ['NG-DEPRECIATION'],
    groupNameKeywords: ['depreciation', 'amortis', 'amortiz'],
    sheet: 'PL',
    assetLiability: 'Expenses',
  },
  pat: {
    label: 'Profit / (Loss) After Tax',
    groupNameKeywords: [
      'profit / (loss) for the year', 'profit for the year',
      'loss for the year', 'profit after tax',
    ],
    sheet: 'PL',
    // PAT is stored as a BS equity line (the closing to equity), not PL
    // Try both sheets
    anySheet: true,
  },
  ltBorrowings: {
    label: 'Long-Term Borrowings',
    noteGroupIds: ['NG-LT-BORROWINGS'],
    groupNameKeywords: ['long term borrowing', 'long-term borrowing', 'non-current borrowing'],
    sheet: 'BS',
    assetLiability: 'Liabilities',
  },
  stBorrowings: {
    label: 'Short-Term Borrowings',
    noteGroupIds: ['NG-ST-BORROWINGS'],
    groupNameKeywords: ['short term borrowing', 'short-term borrowing'],
    sheet: 'BS',
    assetLiability: 'Liabilities',
  },
  tradeReceivables: {
    label: 'Trade Receivables',
    groupNameKeywords: ['trade receivable', 'trade and other receivable', 'debtor', 'account receivable'],
    sheet: 'BS',
    assetLiability: 'Assets',
  },
  tradePayables: {
    label: 'Trade Payables',
    noteGroupIds: ['NG-TRADE-PAYABLES'],
    groupNameKeywords: ['trade payable', 'trade and other payable', 'account payable', 'creditor'],
    sheet: 'BS',
    assetLiability: 'Liabilities',
  },
  cash: {
    label: 'Cash and Cash Equivalents',
    groupNameKeywords: ['cash', 'bank balance', 'cash and bank', 'cash and cash equivalent'],
    sheet: 'BS',
    assetLiability: 'Assets',
  },
  revenue: {
    label: 'Revenue',
    noteGroupIds: ['NG-REVENUE', 'NG-REVENUE-IFRS15'],
    groupNameKeywords: ['revenue from operations', 'revenue from contracts', 'turnover'],
    sheet: 'PL',
    assetLiability: 'Income',
  },
};

/**
 * Reads CY FSLines and computes expected closing amounts for all schedules.
 * Returns: { ppe: number, intangibles: number, dta: number, ... }
 */
async function getScheduleAnchors(engagementId) {
  const fsLines = await prisma.fSLine.findMany({
    where: { engagementId, isPriorYear: false },
  });

  const result = {};

  for (const [scheduleKey, def] of Object.entries(SCHEDULE_ANCHORS)) {
    let matchedLines = [];

    // Priority 1: noteGroupId match
    if (def.noteGroupIds?.length) {
      matchedLines = fsLines.filter(l =>
        def.noteGroupIds.includes(l.noteGroupId) &&
        (def.anySheet || l.sheet === def.sheet) &&
        (!def.assetLiability || l.assetLiability === def.assetLiability)
      );
    }

    // Priority 2: keyword match on groupName
    if (matchedLines.length === 0 && def.groupNameKeywords?.length) {
      matchedLines = fsLines.filter(l => {
        const n = (l.groupName || '').toLowerCase();
        const sheetMatch = def.anySheet || l.sheet === def.sheet;
        const alMatch    = !def.assetLiability || l.assetLiability === def.assetLiability;
        const kwMatch    = def.groupNameKeywords.some(kw => n.includes(kw));
        return sheetMatch && alMatch && kwMatch;
      });
    }

    result[scheduleKey] = {
      amount:   matchedLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0),
      lines:    matchedLines.map(l => ({ groupName: l.groupName, amount: Number(l.totalFinalNet || 0) })),
      label:    def.label,
      hasData:  matchedLines.length > 0,
    };
  }

  return result;
}

/**
 * Reads PY FSLines and returns opening balance anchors.
 * PY closing = CY opening. Allows schedule forms to pre-populate opening columns.
 * Returns same structure as getScheduleAnchors but for PY.
 */
async function getPYOpeningBalances(engagementId) {
  const pyFSLines = await prisma.fSLine.findMany({
    where: { engagementId, isPriorYear: true },
  });

  if (pyFSLines.length === 0) return null;

  // Reuse same anchor logic but over PY lines
  const result = {};

  for (const [scheduleKey, def] of Object.entries(SCHEDULE_ANCHORS)) {
    let matchedLines = [];

    if (def.noteGroupIds?.length) {
      matchedLines = pyFSLines.filter(l =>
        def.noteGroupIds.includes(l.noteGroupId) &&
        (def.anySheet || l.sheet === def.sheet) &&
        (!def.assetLiability || l.assetLiability === def.assetLiability)
      );
    }

    if (matchedLines.length === 0 && def.groupNameKeywords?.length) {
      matchedLines = pyFSLines.filter(l => {
        const n = (l.groupName || '').toLowerCase();
        return (def.anySheet || l.sheet === def.sheet) &&
          (!def.assetLiability || l.assetLiability === def.assetLiability) &&
          def.groupNameKeywords.some(kw => n.includes(kw));
      });
    }

    result[scheduleKey] = {
      amount:  matchedLines.reduce((s, l) => s + Number(l.totalFinalNet || 0), 0),
      hasData: matchedLines.length > 0,
    };
  }

  return result;
}

/**
 * PAT from FSLine — used by EPS.
 * Reads the "Profit for the Year" line from PL, which is the PAT after all expenses and tax.
 * More reliable than keyword-summing income/expense lines.
 */
async function getPATFromFSLine(engagementId) {
  const plLines = await prisma.fSLine.findMany({
    where: { engagementId, isPriorYear: false, sheet: 'PL' },
  });

  const income  = plLines.filter(l => l.assetLiability === 'Income').reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
  const expense = plLines.filter(l => l.assetLiability === 'Expenses').reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);

  // PAT = total income - total expenses (including tax)
  const pat = income - expense;

  // Also check if there's an explicit PAT equity line (added by generateFS)
  const patEquityLine = await prisma.fSLine.findFirst({
    where: {
      engagementId,
      isPriorYear: false,
      sheet: 'BS',
      assetLiability: 'Equity',
      groupName: { contains: 'Profit' },
    },
  });

  return {
    pat,
    patFromEquityLine: patEquityLine ? Number(patEquityLine.totalFinalNet || 0) : null,
    // Use the equity line if available (it's the signed, display-corrected value)
    // Otherwise use income-expense calculation
    recommended: patEquityLine ? Number(patEquityLine.totalFinalNet || 0) : pat,
  };
}

/**
 * Run schedule casting checks.
 * Compares schedule closing totals against FSLine anchors.
 * Returns array of check result objects compatible with ValidationLog schema.
 */
async function getScheduleCastingErrors(engagementId) {
  const errors = [];
  const anchors = await getScheduleAnchors(engagementId);

  // ── PPE casting check ──────────────────────────────────────────────────────
  const ppeRows = await prisma.pPEClass.findMany({ where: { engagementId } });
  if (ppeRows.length > 0 && anchors.ppe.hasData) {
    const scheduleClosingNet = ppeRows.reduce((s, r) => {
      const closingGross = Number(r.openingGross || 0) + Number(r.additions || 0) - Number(r.disposals || 0) + Number(r.revaluationAmt || 0);
      const closingDepr  = r.isDepreciable
        ? Number(r.openingDepr || 0) + Number(r.deprForYear || 0) - Number(r.deprOnDisposal || 0)
        : 0;
      return s + closingGross - closingDepr - Number(r.impairmentAmt || 0);
    }, 0);

    const fsAmount = anchors.ppe.amount;
    const diff     = Math.abs(scheduleClosingNet - fsAmount);

    errors.push({
      checkType: 'SCHEDULE_PPE',
      status:    diff < 1 ? 'PASS' : 'FAIL',
      message:   diff < 1
        ? `✓ PPE schedule closing net block (${scheduleClosingNet.toFixed(2)}) matches Balance Sheet (${fsAmount.toFixed(2)})`
        : `✗ PPE schedule closing net block (${scheduleClosingNet.toFixed(2)}) ≠ Balance Sheet (${fsAmount.toFixed(2)}) — Difference: ${diff.toFixed(2)}`,
      detail: { scheduleClosingNet, fsAmount, difference: diff },
    });
  }

  // ── Intangibles casting check ──────────────────────────────────────────────
  const intangRows = await prisma.intangibleClass.findMany({ where: { engagementId } });
  if (intangRows.length > 0 && anchors.intangibles.hasData) {
    const scheduleClosingNet = intangRows.reduce((s, r) => {
      const cg  = Number(r.openingGross || 0) + Number(r.additions || 0) - Number(r.disposals || 0);
      const ca  = r.isIndefinite ? 0 : Number(r.openingAmort || 0) + Number(r.amortForYear || 0) - Number(r.amortOnDisposal || 0);
      return s + cg - ca - Number(r.impairmentAmt || 0);
    }, 0);

    const fsAmount = anchors.intangibles.amount;
    const diff     = Math.abs(scheduleClosingNet - fsAmount);

    errors.push({
      checkType: 'SCHEDULE_INTANGIBLES',
      status:    diff < 1 ? 'PASS' : 'FAIL',
      message:   diff < 1
        ? `✓ Intangibles schedule closing net block (${scheduleClosingNet.toFixed(2)}) matches Balance Sheet (${fsAmount.toFixed(2)})`
        : `✗ Intangibles schedule closing net block (${scheduleClosingNet.toFixed(2)}) ≠ Balance Sheet (${fsAmount.toFixed(2)}) — Difference: ${diff.toFixed(2)}`,
      detail: { scheduleClosingNet, fsAmount, difference: diff },
    });
  }

  // ── Depreciation expense casting check ────────────────────────────────────
  if (anchors.depreciation.hasData) {
    const ppeDepr    = ppeRows.reduce((s, r) => s + (r.isDepreciable ? Number(r.deprForYear || 0) : 0), 0);
    const intangDepr = intangRows.reduce((s, r) => s + (r.isIndefinite ? 0 : Number(r.amortForYear || 0)), 0);
    const totalScheduleDepr = ppeDepr + intangDepr;
    const fsDepr            = Math.abs(anchors.depreciation.amount); // expense shown as positive
    const diff              = Math.abs(totalScheduleDepr - fsDepr);

    if (totalScheduleDepr > 0 || fsDepr > 0) {
      errors.push({
        checkType: 'SCHEDULE_DEPRECIATION',
        status:    diff < 1 ? 'PASS' : diff < fsDepr * 0.05 ? 'WARNING' : 'FAIL',
        message:   diff < 1
          ? `✓ Depreciation in schedules (${totalScheduleDepr.toFixed(2)}) matches P&L depreciation expense (${fsDepr.toFixed(2)})`
          : `${diff < fsDepr * 0.05 ? '⚠' : '✗'} Schedule depreciation (${totalScheduleDepr.toFixed(2)}) vs P&L depreciation (${fsDepr.toFixed(2)}) — Difference: ${diff.toFixed(2)}`,
        detail: { ppeDepr, intangDepr, totalScheduleDepr, fsDepr, difference: diff },
      });
    }
  }

  // ── Deferred Tax casting check ─────────────────────────────────────────────
  const dtItems = await prisma.deferredTaxItem.findMany({ where: { engagementId } });
  if (dtItems.length > 0) {
    const scheduleNetDT = dtItems.reduce((s, r) => {
      const rate    = Number(r.taxRate || 0) / 100;
      const opening = Number(r.openingDiff || 0) * rate;
      const pl      = (Number(r.createdInPL || 0) - Number(r.reversedInPL || 0)) * rate;
      const oci     = (Number(r.createdInOCI || 0) - Number(r.reversedInOCI || 0)) * rate;
      const closing = opening + pl + oci;
      return r.isAsset ? s + closing : s - closing;
    }, 0);

    // Compare net against DTA (if positive) or DTL (if negative) from FSLine
    const fsDTA  = anchors.dta.amount;
    const fsDTL  = anchors.dtl.amount;
    const fsNet  = fsDTA - fsDTL;
    const diff   = Math.abs(scheduleNetDT - fsNet);

    if (dtItems.some(i => Number(i.openingDiff || 0) > 0 || Number(i.createdInPL || 0) > 0)) {
      errors.push({
        checkType: 'SCHEDULE_DEFERRED_TAX',
        status:    diff < 1 ? 'PASS' : 'FAIL',
        message:   diff < 1
          ? `✓ Deferred tax working (net ${scheduleNetDT.toFixed(2)}) matches Balance Sheet DTA/DTL (net ${fsNet.toFixed(2)})`
          : `✗ Deferred tax working net (${scheduleNetDT.toFixed(2)}) ≠ Balance Sheet net DTA/DTL (${fsNet.toFixed(2)}) — Difference: ${diff.toFixed(2)}`,
        detail: { scheduleNetDT, fsDTA, fsDTL, fsNet, difference: diff },
      });
    }
  }

  // ── EPS PAT check ──────────────────────────────────────────────────────────
  const eps = await prisma.ePSData.findFirst({ where: { engagementId } });
  if (eps) {
    const { recommended: fsPAT } = await getPATFromFSLine(engagementId);
    const epsPAT = Number(eps.patFromPL || 0);
    const diff   = Math.abs(epsPAT - fsPAT);

    errors.push({
      checkType: 'SCHEDULE_EPS_PAT',
      status:    diff < 1 ? 'PASS' : 'WARNING',
      message:   diff < 1
        ? `✓ EPS PAT (${epsPAT.toFixed(2)}) matches P&L computed PAT (${fsPAT.toFixed(2)})`
        : `⚠ EPS uses PAT of ${epsPAT.toFixed(2)} but P&L shows ${fsPAT.toFixed(2)} — Difference: ${diff.toFixed(2)}. Re-open Schedules → EPS to refresh.`,
      detail: { epsPAT, fsPAT, difference: diff },
    });
  }

  return errors;
}

module.exports = { getScheduleAnchors, getPYOpeningBalances, getPATFromFSLine, getScheduleCastingErrors };
