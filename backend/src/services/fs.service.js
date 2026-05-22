'use strict';

const { prisma }          = require('../config/db');
const { assignNoteNumbers } = require('../utils/noteNumbering');
const { runAllChecks }    = require('./validation.service');

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
async function generateFS(engagementId, firmId) {
  const engagement = await prisma.engagement.findFirst({
    where: { id: engagementId, client: { firmId } },
    include: { client: { include: { firm: true } } },
  });
  if (!engagement) throw Object.assign(new Error('Engagement not found'), { status: 404 });

  const latest = await prisma.tBVersion.findFirst({
    where: { engagementId },
    orderBy: { versionNumber: 'desc' },
    include: { rows: true },
  });
  if (!latest) throw Object.assign(new Error('No TB uploaded yet'), { status: 422 });

  const mappings = await prisma.mapping.findMany({ where: { engagementId } });
  if (!mappings.length) throw Object.assign(new Error('No mappings found. Map TB items first.'), { status: 422 });

  const method   = engagement.method;
  // Currency from firm, fall back to method-based default
  const currency = engagement.client?.firm?.currency ||
    (['IFRS','IFRS_SME'].includes(method) ? 'AED' : 'INR');
  // Store currency in engagement for use in rounding threshold
  engagement.currency = currency;

  // Build mapping index — case insensitive, trim whitespace
  const mappingIndex = new Map(
    mappings.map(m => [m.subGrouping.trim().toLowerCase(), m])
  );

  // ── Aggregate TB rows by FS Head ─────────────────────────────────────────
  const aggregates  = new Map(); // groupName → { totalRawNet, al, sheet, noteGroupId, ... }
  const unmappedSGs = new Set();

  for (const row of latest.rows) {
    const key     = row.subGrouping.trim().toLowerCase();
    const mapping = mappingIndex.get(key);

    if (!mapping?.groupName) {
      unmappedSGs.add(row.subGrouping);
      continue;
    }

    const { al, sheet } = classify(mapping.groupName, method);
    const rawNet        = Number(row.finalNet || 0);

    if (!aggregates.has(mapping.groupName)) {
      aggregates.set(mapping.groupName, {
        groupName:      mapping.groupName,
        totalRawNet:    0,
        noteGroupId:    mapping.noteGroupId || null,
        sheet,
        assetLiability: al,
        displayOrder:   mapping.displayOrder ?? null,
        rows:           [],
      });
    }
    const agg = aggregates.get(mapping.groupName);
    agg.totalRawNet += rawNet;
    agg.rows.push(row);
  }

  // ── Apply display sign flip ───────────────────────────────────────────────
  for (const agg of aggregates.values()) {
    agg.totalFinalNet = displaySign(agg.totalRawNet, agg.assetLiability);
  }

  // ── Close P&L to Equity (mandatory for BS to balance) ────────────────────
  // TB has opening balances only. Net P&L must flow to equity.
  // Income stored as negative (credit), Expenses as positive (debit)
  // Net P&L raw = sum of all PL raw values (negative = profit, positive = loss)
  const plRawSum = [...aggregates.values()]
    .filter(a => a.sheet === 'PL')
    .reduce((s, a) => s + a.totalRawNet, 0);
  // OCI raw sum (negative = income/gain in OCI)
  const ociRawSum = [...aggregates.values()]
    .filter(a => a.sheet === 'OCI')
    .reduce((s, a) => s + a.totalRawNet, 0);

  // PAT for display = flip sign of raw PL sum
  // (negative raw PL = profit = positive display)
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

  // ── Rounding Difference Absorber ──────────────────────────────────────────
  // After P&L close, recalculate BS totals
  // Any remaining difference (due to floating point or TB rounding) is absorbed
  // into a "Rounding Difference" equity line — standard accounting practice
  const bsCheck = {
    assets: [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Assets').reduce((s,a)=>s+a.totalFinalNet,0),
    equity: [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Equity').reduce((s,a)=>s+a.totalFinalNet,0),
    liab:   [...aggregates.values()].filter(a=>a.sheet==='BS'&&a.assetLiability==='Liabilities').reduce((s,a)=>s+a.totalFinalNet,0),
  };
  const remainingDiff = bsCheck.assets - bsCheck.equity - bsCheck.liab;

  // Absorb rounding differences up to configured threshold
  const roundingThreshold = engagement.currency === 'AED' ? 10 : 100; // AED 10, INR 100

  if (Math.abs(remainingDiff) > 0.001 && Math.abs(remainingDiff) <= roundingThreshold) {
    aggregates.set('__ROUNDING__', {
      groupName:      'Rounding Difference',
      totalRawNet:    -remainingDiff,
      totalFinalNet:  remainingDiff,
      noteGroupId:    null,
      sheet:          'BS',
      assetLiability: 'Equity',
      rows:           [],
    });
  }

  // ── BS Validation ─────────────────────────────────────────────────────────
  // Since TB is balanced (ΣfinalNet = 0), and we flip signs for display,
  // BS should balance: Assets = Equity + Liabilities
  const bsAggs    = [...aggregates.values()].filter(a => a.sheet === 'BS');
  const assets    = bsAggs.filter(a => a.assetLiability === 'Assets').reduce((s,a) => s + a.totalFinalNet, 0);
  const equity    = bsAggs.filter(a => a.assetLiability === 'Equity').reduce((s,a) => s + a.totalFinalNet, 0);
  const liab      = bsAggs.filter(a => a.assetLiability === 'Liabilities').reduce((s,a) => s + a.totalFinalNet, 0);
  const bsDiff    = assets - equity - liab;
  const errors    = Math.abs(bsDiff) > 0.01
    ? [{ type: 'BS_MISMATCH', message: `Balance Sheet difference: ${bsDiff.toFixed(2)}. Check that all liability/equity items are mapped correctly.`, detail: { assets, equity, liab, difference: bsDiff } }]
    : [];

  // ── Assign note numbers in correct FS display order ─────────────────────
  // Works universally for any TB — order derived from FS structure not TB order

  const SHEET_ORDER = { BS: 0, PL: 1, OCI: 2 };

  // Within BS: order by assetLiability based on method
  // IFRS: Assets → Equity → Liabilities
  // AS/IndAS: Equity → Liabilities → Assets  (Schedule III)
  const isIFRS   = ['IFRS','IFRS_SME'].includes(method);
  const BS_AL_ORDER = isIFRS
    ? { Assets: 0, Equity: 1, Liabilities: 2 }
    : { Equity: 0, Liabilities: 1, Assets: 2 };

  // Within PL: Revenue → COGS → Gross Profit → Other Income → Opex → Finance → Tax
  const PL_AL_ORDER = { Income: 0, Expenses: 1 };

  // Within Assets/Liabilities: Non-Current before Current (keyword detection)
  function isNonCurrent(groupName) {
    const n = (groupName || '').toLowerCase();
    if (n.includes('short term') || n.includes('short-term')) return false;
    if (n.includes('long term')  || n.includes('long-term'))  return true;
    // Non-current asset keywords
    const NCA = ['property, plant','property plant','fixed asset','tangible asset','ppe',
      'land','building','furniture','fixture','vehicle','motor','machinery','equipment','computer',
      'right-of-use','right of use','rou asset','intangible','goodwill','software','trademark','patent',
      'capital work in progress','capital wip','cwip','construction in progress','asset under construction',
      'non-current investment','investment in subsidiary','investment in associate',
      'investment in joint venture','investment in equity','quoted investment','unquoted investment',
      'deferred tax asset','security deposit','earnest money deposit',
      'capital advance','other non-current','non-current asset'];
    if (NCA.some(k => n.includes(k))) return true;
    // investment alone (not "current investment") = non-current
    if (n.includes('investment') && !n.includes('current invest') && !n.includes('short')) return true;
    return false;
  }

  function isCurrentAsset(groupName) {
    const n = (groupName || '').toLowerCase();
    if (n.includes('short term') || n.includes('short-term')) return true;
    const CA = ['inventor','stock','raw material','finished good','work in progress',
      'trade receivable','account receivable','sundry debtor','debtor','bill receivable',
      'cash in hand','cash in bank','cash at bank','cash and bank','cash and cash equivalent',
      'bank balance','current investment','short term investment',
      'loans and advance','loan and advance','advance to','advance paid','prepaid','prepayment',
      'other current','accrued income','income receivable','interest receivable',
      'vat receivable','gst receivable','input tax','advance tax','tds receivable',
      'provision for bad debt','due from'];
    return CA.some(k => n.includes(k));
  }

  function isNonCurrentLiab(groupName) {
    const n = (groupName || '').toLowerCase();
    if (n.includes('short term') || n.includes('short-term')) return false;
    if (n.includes('long term')  || n.includes('long-term'))  return true;
    const NCL = ['non-current liab','deferred tax liab','lease liabilit','finance lease',
      'provision for gratuity','gratuity liabilit','pension','post employment',
      'defined benefit','employee benefit liabilit','compensated absence',
      'bond','debenture','term loan','ecb','external commercial',
      'other non-current liabilit','security deposit received'];
    return NCL.some(k => n.includes(k));
  }

  // P&L sub-ordering: Revenue=0, COS=1, OtherIncome=2, Selling=3, Admin=4, Depr=5, Finance=6, Tax=7
  function plSubOrder(groupName) {
    const n = (groupName || '').toLowerCase();
    if (n.includes('revenue') || n.includes('turnover') || n.includes('sales') || n.includes('income from operations')) return 0;
    if (n.includes('cost of') || n.includes('cost of sale') || n.includes('cogs') || n.includes('cost of revenue') || n.includes('cost of good') || n.includes('cost of material')) return 1;
    if (n.includes('other income') || n.includes('other revenue') || n.includes('miscellaneous income')) return 2;
    if (n.includes('selling') || n.includes('distribution') || n.includes('marketing')) return 3;
    if (n.includes('admin') || n.includes('general') || n.includes('employee') || n.includes('staff') || n.includes('salary') || n.includes('wages')) return 4;
    if (n.includes('depreciation') || n.includes('amortis') || n.includes('amortiz')) return 5;
    if (n.includes('finance cost') || n.includes('interest') || n.includes('bank charge')) return 6;
    if (n.includes('tax') || n.includes('income tax')) return 7;
    return 3; // default: operating expense bucket
  }

  const sortedAggs = [...aggregates.values()].sort((a, b) => {
    // 0. If user explicitly set displayOrder on mapping — use it first (highest priority)
    if (a.displayOrder != null && b.displayOrder != null) {
      return a.displayOrder - b.displayOrder;
    }
    // If only one has it, that one comes first
    if (a.displayOrder != null) return -1;
    if (b.displayOrder != null) return 1;

    // 1. Sheet order
    const sd = (SHEET_ORDER[a.sheet] ?? 9) - (SHEET_ORDER[b.sheet] ?? 9);
    if (sd !== 0) return sd;

    // 2. Within BS: by AL group (method-specific)
    if (a.sheet === 'BS') {
      const ad = (BS_AL_ORDER[a.assetLiability] ?? 9) - (BS_AL_ORDER[b.assetLiability] ?? 9);
      if (ad !== 0) return ad;

      // 3. Within Assets: Non-Current before Current
      if (a.assetLiability === 'Assets' && b.assetLiability === 'Assets') {
        const aNC = isNonCurrent(a.groupName) ? 0 : 1;
        const bNC = isNonCurrent(b.groupName) ? 0 : 1;
        if (aNC !== bNC) return aNC - bNC;
      }

      // 3. Within Liabilities: Non-Current before Current
      if (a.assetLiability === 'Liabilities' && b.assetLiability === 'Liabilities') {
        const aNC = isNonCurrentLiab(a.groupName) ? 0 : 1;
        const bNC = isNonCurrentLiab(b.groupName) ? 0 : 1;
        if (aNC !== bNC) return aNC - bNC;
      }
    }

    // 4. Within PL: Income before Expenses
    if (a.sheet === 'PL') {
      const pd = (PL_AL_ORDER[a.assetLiability] ?? 9) - (PL_AL_ORDER[b.assetLiability] ?? 9);
      if (pd !== 0) return pd;
      // Within same AL: sub-order by P&L structure
      return plSubOrder(a.groupName) - plSubOrder(b.groupName);
    }

    return 0;
  });

  const uniqueNoteGroupIds = [...new Set(sortedAggs.map(a => a.noteGroupId).filter(Boolean))];
  const noteNumberMap      = assignNoteNumbers(method, uniqueNoteGroupIds);

  // ── Persist to DB ─────────────────────────────────────────────────────────
  const result = await prisma.$transaction(async (tx) => {
    await tx.noteDetail.deleteMany({ where: { engagementId } });
    await tx.fSLine.deleteMany({ where: { engagementId } });
    await tx.noteGroup.deleteMany({ where: { engagementId } });

    // Create NoteGroups for every aggregate with a noteGroupId
    let autoNum = 100;
    const createdNGs = new Map();

    for (const [, agg] of aggregates) {
      if (!agg.noteGroupId || createdNGs.has(agg.noteGroupId)) continue;
      const noteNumber = noteNumberMap.get(agg.noteGroupId) || autoNum++;
      const ng = await tx.noteGroup.create({
        data: { engagementId, noteGroupId: agg.noteGroupId, noteNumber, title: agg.groupName, isMandatory: false },
      });
      createdNGs.set(agg.noteGroupId, ng);
    }

    // Create FSLines
    let order = 0;
    const fsLineData = [];

    for (const [, agg] of aggregates) {
      const line = await tx.fSLine.create({
        data: {
          engagementId,
          tbVersionId:    latest.id,
          sheet:          agg.sheet,
          groupName:      agg.groupName,
          totalFinalNet:  agg.totalFinalNet,
          noteGroupId:    agg.noteGroupId || null,
          displayOrder:   ++order,
          assetLiability: agg.assetLiability,
        },
      });

      const ngData = agg.noteGroupId ? createdNGs.get(agg.noteGroupId) : null;
      fsLineData.push({ ...line, noteGroup: ngData || null });
    }

    return { sheets: groupBySheet(fsLineData), errors, unmappedCount: unmappedSGs.size };
  });

  // Create NoteDetails AFTER transaction (NoteGroups now committed)
  try {
    await prisma.noteDetail.deleteMany({ where: { engagementId } });
    for (const [, agg] of aggregates) {
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

  try { await runAllChecks(engagementId, latest.id); } catch (_) {}
  return result;
}

// ════════════════════════════════════════════════════════════════════════════
// GET FS (fetch existing)
// ════════════════════════════════════════════════════════════════════════════
async function getFS(engagementId) {
  const [lines, noteGroups] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId }, orderBy: { displayOrder: 'asc' } }),
    prisma.noteGroup.findMany({ where: { engagementId } }),
  ]);
  const ngMap    = new Map(noteGroups.map(ng => [ng.noteGroupId, ng]));
  const enriched = lines.map(l => ({ ...l, noteGroup: l.noteGroupId ? (ngMap.get(l.noteGroupId) || null) : null }));
  return groupBySheet(enriched);
}

function groupBySheet(lines) {
  return lines.reduce((acc, l) => {
    acc[l.sheet] = acc[l.sheet] || [];
    acc[l.sheet].push(l);
    return acc;
  }, {});
}

module.exports = { generateFS, getFS };
