
'use strict';
 
const { prisma }          = require('../config/db');
const { assignNoteNumbers } = require('../utils/noteNumbering');
// Validation service is optional — if not present, FS generation still works
let runAllChecks = async () => {};
try { ({ runAllChecks } = require('./validation.service')); } catch (_) {}
 
// ════════════════════════════════════════════════════════════════════════════
// SIGN CONVENTION
// TB stores:
//   Debit-normal accounts  (Assets, Expenses)  → positive finalNet
//   Credit-normal accounts (Liabilities, Equity, Income) → negative finalNet
//
// For FS display we FLIP the sign of credit-normal accounts so they show positive.
// We do NOT change any amounts — pure sign flip for display only.
// Because TB is balanced (ΣfinalNet = 0), the BS will tally automatically.
// ════════════════════════════════════════════════════════════════════════════
function displaySign(rawAmount, category) {
  const n = Number(rawAmount || 0);
  // Credit-normal: stored negative in TB → flip to positive for display
  if (category === 'Liabilities' || category === 'Equity' || category === 'Income') return -n;
  // Debit-normal: stored positive in TB → keep as-is
  return n;
}
 
// ════════════════════════════════════════════════════════════════════════════
// CLASSIFICATION ENGINE
// Returns { al: 'Assets'|'Liabilities'|'Equity'|'Income'|'Expenses', sheet: 'BS'|'PL'|'OCI' }
// ════════════════════════════════════════════════════════════════════════════
function classify(groupName, method) {
  const g = groupName.toLowerCase().trim();
  const starts = (...kw) => kw.some(k => g.startsWith(k));
  const has    = (...kw) => kw.some(k => g.includes(k));
 
  // ── Priority overrides ────────────────────────────────────────────────────
  if (has('retained earnings','retained profit','accumulated profit','surplus','r&s - surplus'))
    return { al: 'Equity', sheet: 'BS' };
  if (has('due from','receivable from related'))
    return { al: 'Assets', sheet: 'BS' };
  if (has('due to','payable to related'))
    return { al: 'Liabilities', sheet: 'BS' };
 
  // ── OCI ───────────────────────────────────────────────────────────────────
  if (has('other comprehensive','actuarial','remeasurement','fvoci','translation reserve','hedging reserve'))
    return { al: 'Expenses', sheet: 'OCI' };
 
  // ── PL: Expenses FIRST (before income, to avoid "cost of sales" matching "sales") ──
  if (starts('cost of','purchase of','changes in','provision for','loss on') ||
      has('cost of sale','cost of good','cost of material','cost of revenue',
          'purchase of stock','changes in inventor',
          'employee benefit','salary','wages','staff cost','manpower','compensation','gratuity',
          'finance cost','interest expense','borrowing cost','bank charge','bank interest',
          'depreciation','amortis','amortiz','impairment',
          'selling expense','distribution expense','administrative','marketing','advertising',
          'rent expense','utilities','insurance expense','legal','professional fee','audit fee',
          'income tax expense','tax expense','current tax','deferred tax expense',
          'exceptional','partners remuneration','partner remuneration','bonus',
          'subscription charge','travelling','travel expense','bad debt'))
    return { al: 'Expenses', sheet: 'PL' };
 
  // ── PL: Income ────────────────────────────────────────────────────────────
  if (has('revenue from operations','revenue from contracts','turnover',
          'other income','other gain','finance income','interest income',
          'dividend income','rental income','grant income') ||
      (method === 'IFRS' || method === 'IFRS_SME') && (g === 'revenue' || starts('revenue from')))
    return { al: 'Income', sheet: 'PL' };
 
  // ── BS: Equity ────────────────────────────────────────────────────────────
  if (has('share capital','ordinary share','preference share','paid-up capital',
          'share premium','securities premium','additional paid',
          'other equity','other reserve','general reserve','capital reserve',
          'revaluation reserve','foreign currency translation',
          'non-controlling interest','minority interest','nci',
          'money received against share warrant'))
    return { al: 'Equity', sheet: 'BS' };
 
  // ── BS: Loans GIVEN (Assets) — must come BEFORE Liabilities block ──────────
  // Schedule III: "Loans and Advances" = amounts given out by company = Assets
  // "Long Term Loans and Advances" = Non-Current Asset
  // "Short Term Loans and Advances" = Current Asset
  // Key: "loans and advances" = Asset; "borrowings" = Liability
  if (has('loans and advance','loan and advance',
          'long term loan and advance','long-term loan and advance',
          'short term loan and advance','short-term loan and advance',
          'advance to employee','advance to staff','advance to director',
          'security deposit paid','earnest money','retention money',
          'capital advance','advance for capital')) {
    // These are amounts given OUT by the company — always Assets
    return { al: 'Assets', sheet: 'BS' };
  }
 
  // ── BS: Liabilities ───────────────────────────────────────────────────────
  if (has('long term borrowing','long-term borrowing','non-current borrowing',
          'bond','debenture','term loan from bank','loan from bank','loan from nbfc',
          'lease liabilit','lease obligation',
          'employee benefit liab','pension liab','provision for gratuity','long term provision',
          'deferred tax liab','other non-current liab','other long term liab',
          'trade payable','trade and other payable','accounts payable','sundry creditor',
          'other payable','other current liab','accrued expense','accrual',
          'short term borrowing','short-term borrowing','bank overdraft','overdraft',
          'current lease','current borrowing',
          'short term provision','provision for tax','vat payable','gst payable','tax payable',
          'directors loan','director loan','shareholder loan',
          'advance from customer','customer deposit','deferred revenue',
          'dividend payable','duties and taxes','duties and tax'))
    return { al: 'Liabilities', sheet: 'BS' };
 
  // ── BS: Assets ────────────────────────────────────────────────────────────
  if (has('property, plant','property plant','fixed asset','plant and machinery',
          'furniture','vehicle','computer','equipment','land','building','leasehold',
          'right-of-use','right of use','rou asset',
          'intangible asset','goodwill','software','trademark','patent','brand',
          'capital work in progress','cwip',
          'non-current investment','long-term investment','investment in associate','investment in subsidiary',
          'deferred tax asset',
          'long term loan','security deposit','other non-current asset',
          'inventor','stock','raw material','finished good',
          'trade receivable','trade and other receivable','account receivable','sundry debtor','debtor',
          'other receivable','accrued income','prepayment','prepaid','advance to supplier',
          'cash in hand','cash in bank','bank balance','cash and bank','cash and cash equivalent',
          'short-term investment','current investment',
          'income tax receivable','vat receivable','gst receivable','other current asset',
          'provision for bad debt','money media',
          'long term loans and advance','short term loans and advance',
          'loans and advance','advance given','advance paid',
          'long-term loans and advance','short-term loans and advance'))
    return { al: 'Assets', sheet: 'BS' };
 
  // ── Fallback by keyword ───────────────────────────────────────────────────
  if (has('income','revenue','gain') && !starts('cost','purchase'))
    return { al: 'Income', sheet: 'PL' };
  if (has('expense','cost','loss'))
    return { al: 'Expenses', sheet: 'PL' };
 
  // Default → Assets (safest fallback for BS items)
  return { al: 'Assets', sheet: 'BS' };
}
 
// ════════════════════════════════════════════════════════════════════════════
// GENERATE FS
// Pure aggregation — no calculations, no adjustments, TB values only
// ════════════════════════════════════════════════════════════════════════════
 
// ════════════════════════════════════════════════════════════════════════════
// AGGREGATE TB ROWS → FS LINES
// Pure function — called for both CY and PY TB separately.
//
// Classification priority (MNC standard):
//   1. masterGrouping.assetLiability + masterGrouping.sheet from DB (authoritative)
//   2. classify() keyword fallback (for custom/unmapped groupNames only)
//
// This eliminates the keyword-matching ambiguity for all seeded master items.
// ════════════════════════════════════════════════════════════════════════════
function aggregateTBRows(tbRows, mappingIndex, method, masterIndex = new Map()) {
  const aggregates  = new Map();
  const unmappedSGs = new Set();
 
  for (const row of tbRows) {
    const key     = row.subGrouping.trim().toLowerCase();
    const mapping = mappingIndex.get(key);
 
    if (!mapping?.groupName) {
      unmappedSGs.add(row.subGrouping);
      continue;
    }
 
    // Classification: read directly from MasterGrouping (zero keyword hardcoding)
    // MasterGrouping is the single source of truth — every field is set in reference data.
    // classify() is only used as a last-resort fallback for custom groupNames not in master.
    // Look up by groupName (lowercase) — resilient to stale masterGroupingId UUIDs
    const masterRow = masterIndex.get(mapping.groupName?.trim().toLowerCase()) || null;
    let al, sheet, currentNonCurrent, plCategory, isCashItem;
 
    if (masterRow?.assetLiability && masterRow?.sheet) {
      al                = masterRow.assetLiability;
      sheet             = masterRow.sheet;
      currentNonCurrent = masterRow.currentNonCurrent || null;
      plCategory        = masterRow.plCategory        || null;
      isCashItem        = masterRow.isCashItem        || false;
    } else {
      // Fallback: keyword classify() for custom groupNames not in master
      const classified  = classify(mapping.groupName, method);
      al                = classified.al;
      sheet             = classified.sheet;
      currentNonCurrent = null;
      plCategory        = null;
      isCashItem        = false;
    }
 
    const rawNet = Number(row.finalNet || 0);
 
    if (!aggregates.has(mapping.groupName)) {
      aggregates.set(mapping.groupName, {
        groupName:        mapping.groupName,
        totalRawNet:      0,
        noteGroupId:      mapping.noteGroupId || null,
        sheet,
        assetLiability:   al,
        displayOrder:     mapping.displayOrder ?? null,
        currentNonCurrent,
        plCategory,
        isCashItem,
        rows:             [],
      });
    }
    const agg = aggregates.get(mapping.groupName);
    agg.totalRawNet += rawNet;
    agg.rows.push(row);
  }
 
  // Apply display sign flip
  for (const agg of aggregates.values()) {
    agg.totalFinalNet = displaySign(agg.totalRawNet, agg.assetLiability);
  }
 
  // Close P&L into Equity
  const plRawSum  = [...aggregates.values()].filter(a => a.sheet === 'PL').reduce((s,a) => s + a.totalRawNet, 0);
  const ociRawSum = [...aggregates.values()].filter(a => a.sheet === 'OCI').reduce((s,a) => s + a.totalRawNet, 0);
  const patDisplay = -plRawSum;
  const ociDisplay = -ociRawSum;
 
  if (Math.abs(patDisplay) > 0.01) {
    aggregates.set('__PROFIT_FOR_YEAR__', {
      groupName:      'Profit / (Loss) for the Year',
      totalRawNet:    plRawSum,
      totalFinalNet:  patDisplay,
      noteGroupId:    null,
      sheet:          'BS',
      assetLiability: 'Equity',
      rows:           [],
    });
  }
  if (Math.abs(ociDisplay) > 0.01) {
    aggregates.set('__OCI_EQUITY__', {
      groupName:      'Other Comprehensive Income / (Loss)',
      totalRawNet:    ociRawSum,
      totalFinalNet:  ociDisplay,
      noteGroupId:    null,
      sheet:          'BS',
      assetLiability: 'Equity',
      rows:           [],
    });
  }
 
  return { aggregates, unmappedSGs };
}
 
// ════════════════════════════════════════════════════════════════════════════
// GENERATE FS
// ════════════════════════════════════════════════════════════════════════════
async function generateFS(engagementId, firmId) {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, client: { firmId } },
    include: { client: { include: { firm: true } } },
  });
  if (!engagement) throw Object.assign(new Error('Engagement not found'), { status: 404 });
 
  const latestCY = await prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: false },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latestCY) throw Object.assign(new Error('No TB uploaded yet'), { status: 422 });
 
  const latestPY = await prisma.tBVersion.findFirst({
    where: { engagementId, isPriorYear: true },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
 
  const mappings = await prisma.mapping.findMany({ where: { engagementId } });
  if (!mappings.length) throw Object.assign(new Error('No mappings found. Map TB items first.'), { status: 422 });
 
  const method   = engagement.method;
  const currency = engagement.client?.firm?.currency ||
    (['IFRS','IFRS_SME'].includes(method) ? 'AED' : 'INR');
  engagement.currency = currency;
 
  const mappingIndex = new Map(mappings.map(m => [m.subGrouping.trim().toLowerCase(), m]));
 
  // ── Build MasterGrouping index keyed by groupName (resilient to re-seeding) ─
  // Keying by groupName (not UUID) means stale Mapping.masterGroupingId values
  // don't break generation. Any re-seed/truncate of MasterGrouping is safe.
  let masterIndex = new Map();
  try {
    const applicabilities = ['ALL'];
    if (['AS','IND_AS','IFRS','IFRS_SME'].includes(method)) applicabilities.push(method);
    const masterRows = await prisma.masterGrouping.findMany({
      where: { isActive: true, methodApplicability: { in: applicabilities } },
      select: {
        id: true, groupName: true, assetLiability: true, sheet: true,
        displayOrder: true, noteGroupId: true,
        currentNonCurrent: true, plCategory: true, isCashItem: true,
      },
    });
    for (const r of masterRows) {
      const key = r.groupName.trim().toLowerCase();
      if (!masterIndex.has(key)) masterIndex.set(key, r);
    }
  } catch (schemaErr) {
    console.warn('[FS] MasterGrouping lookup failed, using classify() fallback:', schemaErr.message);
  }
 
  // ── Aggregate CY ──────────────────────────────────────────────────────────
  const { aggregates: cyAggs, unmappedSGs } = aggregateTBRows(latestCY.rows, mappingIndex, method, masterIndex);
 
  const roundingThreshold = currency === 'AED' ? 10 : 100;
  const cyBSCheck = {
    assets: [...cyAggs.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Assets').reduce((s,a)=>s+a.totalFinalNet,0),
    equity: [...cyAggs.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Equity').reduce((s,a)=>s+a.totalFinalNet,0),
    liab:   [...cyAggs.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Liabilities').reduce((s,a)=>s+a.totalFinalNet,0),
  };
  const cyDiff = cyBSCheck.assets - cyBSCheck.equity - cyBSCheck.liab;
  if (Math.abs(cyDiff) > 0.001 && Math.abs(cyDiff) <= roundingThreshold) {
    cyAggs.set('__ROUNDING__', {
      groupName: 'Rounding Difference', totalRawNet: -cyDiff, totalFinalNet: cyDiff,
      noteGroupId: null, sheet: 'BS', assetLiability: 'Equity', rows: [],
    });
  }
 
  const bsAggs = [...cyAggs.values()].filter(a => a.sheet === 'BS');
  const bsDiff = bsAggs.filter(a=>a.assetLiability==='Assets').reduce((s,a)=>s+a.totalFinalNet,0)
               - bsAggs.filter(a=>a.assetLiability==='Equity').reduce((s,a)=>s+a.totalFinalNet,0)
               - bsAggs.filter(a=>a.assetLiability==='Liabilities').reduce((s,a)=>s+a.totalFinalNet,0);
  const errors = Math.abs(bsDiff) > 0.01
    ? [{ type: 'BS_MISMATCH', message: `Balance Sheet difference: ${bsDiff.toFixed(2)}.`, detail: { bsDiff } }]
    : [];
 
  // ── Aggregate PY ──────────────────────────────────────────────────────────
  let pyAggs = new Map();
  let hasPY  = false;
  if (latestPY && latestPY.rows.length > 0) {
    const { aggregates } = aggregateTBRows(latestPY.rows, mappingIndex, method, masterIndex);
    const pyBSCheck = {
      assets: [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Assets').reduce((s,a)=>s+a.totalFinalNet,0),
      equity: [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Equity').reduce((s,a)=>s+a.totalFinalNet,0),
      liab:   [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Liabilities').reduce((s,a)=>s+a.totalFinalNet,0),
    };
    const pyDiff = pyBSCheck.assets - pyBSCheck.equity - pyBSCheck.liab;
    if (Math.abs(pyDiff) > 0.001 && Math.abs(pyDiff) <= roundingThreshold) {
      aggregates.set('__ROUNDING__', {
        groupName: 'Rounding Difference', totalRawNet: -pyDiff, totalFinalNet: pyDiff,
        noteGroupId: null, sheet: 'BS', assetLiability: 'Equity', rows: [],
      });
    }
    pyAggs = aggregates;
    hasPY  = true;
  }
 
  // ── Sort CY aggregates ────────────────────────────────────────────────────
  const SHEET_ORDER = { BS: 0, PL: 1, OCI: 2 };
  const isIFRS      = ['IFRS','IFRS_SME'].includes(method);
  const BS_AL_ORDER = isIFRS ? { Assets: 0, Equity: 1, Liabilities: 2 } : { Equity: 0, Liabilities: 1, Assets: 2 };
  const PL_AL_ORDER = { Income: 0, Expenses: 1 };
 
  function isNonCurrent(gn) {
    const n = (gn||'').toLowerCase();
    if (n.includes('short term')||n.includes('short-term')) return false;
    if (n.includes('long term')||n.includes('long-term'))   return true;
    const KW = ['property, plant','property plant','fixed asset','tangible asset','ppe',
      'land','building','furniture','fixture','vehicle','motor','machinery','equipment','computer',
      'right-of-use','right of use','rou asset','intangible','goodwill','software','trademark','patent',
      'capital work in progress','capital wip','cwip','construction in progress','asset under construction',
      'non-current investment','investment in subsidiary','investment in associate',
      'investment in joint venture','investment in equity','quoted investment','unquoted investment',
      'deferred tax asset','security deposit','earnest money deposit',
      'capital advance','other non-current','non-current asset'];
    if (KW.some(k=>n.includes(k))) return true;
    if (n.includes('investment')&&!n.includes('current invest')&&!n.includes('short')) return true;
    return false;
  }
 
  function isNonCurrentLiab(gn) {
    const n = (gn||'').toLowerCase();
    if (n.includes('short term')||n.includes('short-term')) return false;
    if (n.includes('long term')||n.includes('long-term'))   return true;
    const KW = ['non-current liab','deferred tax liab','lease liabilit','finance lease',
      'provision for gratuity','gratuity liabilit','pension','post employment',
      'defined benefit','employee benefit liabilit','compensated absence',
      'bond','debenture','term loan','ecb','external commercial',
      'other non-current liabilit','security deposit received'];
    return KW.some(k=>n.includes(k));
  }
 
  function plSubOrder(gn) {
    const n = (gn||'').toLowerCase();
    if (n.includes('revenue')||n.includes('turnover')||n.includes('sales')||n.includes('income from operations')) return 0;
    if (n.includes('cost of')||n.includes('cogs')||n.includes('material consumed')) return 1;
    if (n.includes('other income')||n.includes('miscellaneous income')) return 2;
    if (n.includes('selling')||n.includes('distribution')||n.includes('marketing')) return 3;
    if (n.includes('admin')||n.includes('general')||n.includes('employee')||n.includes('salary')||n.includes('wages')) return 4;
    if (n.includes('depreciation')||n.includes('amortis')||n.includes('amortiz')) return 5;
    if (n.includes('finance cost')||n.includes('interest')||n.includes('bank charge')) return 6;
    if (n.includes('tax')||n.includes('income tax')) return 7;
    return 3;
  }
 
  const sortedCYAggs = [...cyAggs.values()].sort((a, b) => {
    if (a.displayOrder != null && b.displayOrder != null) return a.displayOrder - b.displayOrder;
    if (a.displayOrder != null) return -1;
    if (b.displayOrder != null) return 1;
    const sd = (SHEET_ORDER[a.sheet]??9) - (SHEET_ORDER[b.sheet]??9);
    if (sd !== 0) return sd;
    if (a.sheet === 'BS') {
      const ad = (BS_AL_ORDER[a.assetLiability]??9) - (BS_AL_ORDER[b.assetLiability]??9);
      if (ad !== 0) return ad;
      if (a.assetLiability === 'Assets') {
        const r = (isNonCurrent(a.groupName)?0:1) - (isNonCurrent(b.groupName)?0:1);
        if (r !== 0) return r;
      }
      if (a.assetLiability === 'Liabilities') {
        const r = (isNonCurrentLiab(a.groupName)?0:1) - (isNonCurrentLiab(b.groupName)?0:1);
        if (r !== 0) return r;
      }
    }
    if (a.sheet === 'PL') {
      const pd = (PL_AL_ORDER[a.assetLiability]??9) - (PL_AL_ORDER[b.assetLiability]??9);
      if (pd !== 0) return pd;
      return plSubOrder(a.groupName) - plSubOrder(b.groupName);
    }
    return 0;
  });
 
  const uniqueNoteGroupIds = [...new Set(sortedCYAggs.map(a => a.noteGroupId).filter(Boolean))];
  const noteNumberMap      = assignNoteNumbers(method, uniqueNoteGroupIds);
 
  // ── Persist to DB ─────────────────────────────────────────────────────────
  // Use sequential prisma calls (not a long transaction) to avoid timeout.
  // Delete old data first, then bulk-insert new data with createMany.
  // Delete in correct FK order inside a transaction to prevent concurrent-call FK errors
  await prisma.$transaction([
    prisma.noteDetail.deleteMany({ where: { engagementId } }),
    prisma.fSLine.deleteMany({    where: { engagementId } }),
    prisma.noteGroup.deleteMany({ where: { engagementId } }),
  ]);
 
  // Create NoteGroups
  const createdNGs = new Map();
  for (const agg of sortedCYAggs) {
    if (!agg.noteGroupId || createdNGs.has(agg.noteGroupId)) continue;
    const noteNumber = noteNumberMap.get(agg.noteGroupId);
    if (!noteNumber) continue; // skip if somehow not in map (shouldn't happen)
    const ng = await prisma.noteGroup.create({
      data: { engagementId, noteGroupId: agg.noteGroupId, noteNumber, title: agg.groupName, isMandatory: false },
    });
    createdNGs.set(agg.noteGroupId, ng);
  }
 
  // Bulk-insert CY FSLines
  // isPriorYear column may not exist if migration hasn't been run yet.
  // Try with it first; if Postgres complains the column is missing, retry without it.
  let order = 0;
  const cyLineRows = sortedCYAggs.map(agg => ({
    engagementId,
    tbVersionId:      latestCY.id,
    sheet:            agg.sheet,
    groupName:        agg.groupName,
    totalFinalNet:    agg.totalFinalNet,
    noteGroupId:      agg.noteGroupId || null,
    displayOrder:     ++order,
    assetLiability:   agg.assetLiability,
    isPriorYear:      false,
    currentNonCurrent: agg.currentNonCurrent || null,
    plCategory:       agg.plCategory || null,
    isCashItem:       agg.isCashItem || false,
  }));
  try {
    await prisma.fSLine.createMany({ data: cyLineRows, skipDuplicates: true });
  } catch (colErr) {
    if (colErr.message?.includes('isPriorYear') || colErr.message?.includes('column')) {
      console.warn('[FS] isPriorYear column missing — inserting without it (run migration)');
      const cyLineRowsNoFlag = cyLineRows.map(({ isPriorYear, ...rest }) => rest);
      await prisma.fSLine.createMany({ data: cyLineRowsNoFlag, skipDuplicates: true });
    } else {
      throw colErr;
    }
  }
 
  // Build fsLineData for return value (enrich with noteGroup)
  const fsLineData = cyLineRows.map(line => ({
    ...line,
    id:          null, // not needed for return value
    noteGroup:   line.noteGroupId ? (createdNGs.get(line.noteGroupId) || null) : null,
    generatedAt: new Date(),
  }));
 
  // Bulk-insert PY FSLines
  if (hasPY) {
    let pyOrder = 0;
    const pyLineRows = [];
 
    for (const cyAgg of sortedCYAggs) {
      const pyAgg = pyAggs.get(cyAgg.groupName);
      pyLineRows.push({
        engagementId,
        tbVersionId:    latestPY.id,
        sheet:          cyAgg.sheet,
        groupName:      cyAgg.groupName,
        totalFinalNet:  pyAgg ? pyAgg.totalFinalNet : 0,
        noteGroupId:    cyAgg.noteGroupId || null,
        displayOrder:   ++pyOrder,
        assetLiability: cyAgg.assetLiability,
        isPriorYear:    true,
      });
    }
    // PY-only groups
    for (const [gn, pyAgg] of pyAggs) {
      if (cyAggs.has(gn)) continue;
      pyLineRows.push({
        engagementId,
        tbVersionId:    latestPY.id,
        sheet:          pyAgg.sheet,
        groupName:      pyAgg.groupName,
        totalFinalNet:  pyAgg.totalFinalNet,
        noteGroupId:    pyAgg.noteGroupId || null,
        displayOrder:   ++order + 1000,
        assetLiability: pyAgg.assetLiability,
        isPriorYear:    true,
      });
    }
    if (pyLineRows.length > 0) {
      try {
        await prisma.fSLine.createMany({ data: pyLineRows, skipDuplicates: true });
      } catch (pyColErr) {
        if (pyColErr.message?.includes('isPriorYear') || pyColErr.message?.includes('column')) {
          console.warn('[FS] isPriorYear column missing for PY — skipping PY lines (run migration)');
          // PY lines can't be stored without the column — hasPY will be false on getFS
        } else {
          throw pyColErr;
        }
      }
    }
  }
 
  const result = { sheets: groupBySheet(fsLineData), errors, unmappedCount: unmappedSGs.size, hasPY };
 
  // NoteDetails (CY only)
  try {
    await prisma.noteDetail.deleteMany({ where: { engagementId } });
    for (const agg of sortedCYAggs) {
      if (!agg.noteGroupId) continue;
      const ngExists = await prisma.noteGroup.findFirst({ where: { engagementId, noteGroupId: agg.noteGroupId } });
      if (!ngExists) continue;
      for (const tbr of agg.rows) {
        await prisma.noteDetail.create({
          data: {
            engagementId,
            noteGroupId:   agg.noteGroupId,
            subGroupName:  tbr.subGrouping || '',
            accountNumber: tbr.accountNumber || '',
            accountName:   tbr.accountName || '',
            finalNet:      displaySign(Number(tbr.finalNet || 0), agg.assetLiability),
            displayOrder:  0,
          },
        });
      }
    }
  } catch (e) { console.warn('[NoteDetail]', e.message); }
 
  try { await runAllChecks(engagementId, latestCY.id); } catch (_) {}
  return result;
}
 
// ════════════════════════════════════════════════════════════════════════════
// GET FS — returns CY lines enriched with PY amounts as pyAmount field
// ════════════════════════════════════════════════════════════════════════════
async function getFS(engagementId) {
  const [allLines, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId } }),
  ]);
 
  const ngMap   = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const cyLines = allLines.filter(l => !l.isPriorYear);
  const pyLines = allLines.filter(l => l.isPriorYear);
 
  const pyByGroup = new Map(pyLines.map(l => [l.groupName, l]));
  const hasPY     = pyLines.length > 0;
 
  const enriched = cyLines.map(l => ({
    ...l,
    noteGroup: l.noteGroupId ? (ngMap.get(l.noteGroupId) || null) : null,
    pyAmount:  hasPY ? Number(pyByGroup.get(l.groupName)?.totalFinalNet ?? 0) : null,
  }));
 
  return { sheets: groupBySheet(enriched), hasPY };
}
 
function groupBySheet(lines) {
  return lines.reduce((acc, l) => {
    acc[l.sheet] = acc[l.sheet] || [];
    acc[l.sheet].push(l);
    return acc;
  }, {});
}
 
module.exports = { generateFS, getFS };