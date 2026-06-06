'use strict';
const { prisma } = require('../config/db');

async function runAllChecks(engagementId, tbVersionId) {
  const checks = [];

  // Load all data
  const [fsLines, noteGroups, noteDetails, tbVersion, mappings] = await Promise.all([
    prisma.fSLine.findMany({ where: { engagementId } }),
    prisma.noteGroup.findMany({ where: { engagementId } }),
    prisma.noteDetail.findMany({ where: { engagementId } }),
    prisma.tBVersion.findFirst({
      where: { engagementId },
      orderBy: { versionNumber: 'desc' },
      include: { rows: true },
    }),
    prisma.mapping.findMany({ where: { engagementId } }),
  ]);

  const bsLines  = fsLines.filter(l => l.sheet === 'BS');
  const plLines  = fsLines.filter(l => l.sheet === 'PL');
  const ociLines = fsLines.filter(l => l.sheet === 'OCI');

  // ── 1. TB BALANCE CHECK ───────────────────────────────────────────────────
  // The raw TB itself must balance (ΣfinalNet = 0)
  if (tbVersion?.rows?.length > 0) {
    const tbSum = tbVersion.rows.reduce((s, r) => s + Number(r.finalNet || 0), 0);
    const tbDiff = Math.abs(tbSum);
    checks.push({
      engagementId, tbVersionId: tbVersion.id,
      checkType: 'TB_BALANCE',
      status:    tbDiff < 1 ? 'PASS' : 'FAIL',
      message:   tbDiff < 1
        ? `✓ Trial Balance is balanced — Sum of all finalNet = ${tbSum.toFixed(2)}`
        : `✗ Trial Balance is NOT balanced — Sum = ${tbSum.toFixed(2)} (Difference: ${tbDiff.toFixed(2)}). Check TB file for errors.`,
      detail: { tbSum, tbDiff, rowCount: tbVersion.rows.length },
    });
  }

  // ── 2. UNMAPPED ITEMS CHECK ───────────────────────────────────────────────
  const mappedSGs  = new Set(mappings.map(m => m.subGrouping.trim().toLowerCase()));
  const allSGs     = [...new Set(tbVersion?.rows?.map(r => r.subGrouping?.trim().toLowerCase()) || [])];
  const unmappedSGs = allSGs.filter(sg => !mappedSGs.has(sg));
  const unmappedAmt = tbVersion?.rows
    ?.filter(r => !mappedSGs.has(r.subGrouping?.trim().toLowerCase()))
    ?.reduce((s, r) => s + Math.abs(Number(r.finalNet || 0)), 0) || 0;

  checks.push({
    engagementId, tbVersionId: tbVersion?.id,
    checkType: 'UNMAPPED_ITEMS',
    status:    unmappedSGs.length === 0 ? 'PASS' : 'WARNING',
    message:   unmappedSGs.length === 0
      ? `✓ All ${allSGs.length} TB sub-groupings are mapped to FS heads`
      : `⚠ ${unmappedSGs.length} sub-groupings unmapped — Amount excluded: ${unmappedAmt.toFixed(2)}`,
    detail: { unmapped: unmappedSGs, unmappedAmount: unmappedAmt, totalSGs: allSGs.length },
  });

  // ── 3. BS CROSS CASTING — Assets = Equity + Liabilities ───────────────────
  const totalAssets = bsLines.filter(l => l.assetLiability === 'Assets').reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const totalEquity = bsLines.filter(l => l.assetLiability === 'Equity').reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const totalLiab   = bsLines.filter(l => l.assetLiability === 'Liabilities').reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const bsDiff      = Math.abs(totalAssets - totalEquity - totalLiab);

  checks.push({
    engagementId, tbVersionId: tbVersion?.id,
    checkType: 'CROSS_CASTING_BS',
    status:    bsDiff < 1 ? 'PASS' : 'FAIL',
    message:   bsDiff < 1
      ? `✓ Balance Sheet tallies — Assets (${totalAssets.toFixed(2)}) = Equity (${totalEquity.toFixed(2)}) + Liabilities (${totalLiab.toFixed(2)})`
      : `✗ Balance Sheet difference: ${bsDiff.toFixed(2)} — Assets: ${totalAssets.toFixed(2)}, Equity: ${totalEquity.toFixed(2)}, Liabilities: ${totalLiab.toFixed(2)}`,
    detail: { totalAssets, totalEquity, totalLiab, difference: bsDiff },
  });

  // ── 4. P&L CROSS CASTING — Income - Expenses = Net Profit ────────────────
  const totalIncome   = plLines.filter(l => l.assetLiability === 'Income').reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const totalExpenses = plLines.filter(l => l.assetLiability === 'Expenses').reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const netProfit     = totalIncome - totalExpenses;
  const ociTotal      = ociLines.reduce((s,l) => s + Number(l.totalFinalNet), 0);
  const totalCI       = netProfit + ociTotal;

  checks.push({
    engagementId, tbVersionId: tbVersion?.id,
    checkType: 'CROSS_CASTING_PL',
    status: 'INFO',
    message: `P&L: Revenue ${totalIncome.toFixed(2)} − Expenses ${totalExpenses.toFixed(2)} = Net Profit ${netProfit.toFixed(2)} | OCI: ${ociTotal.toFixed(2)} | Total Comprehensive Income: ${totalCI.toFixed(2)}`,
    detail: { totalIncome, totalExpenses, netProfit, ociTotal, totalCI },
  });

  // ── 5. CASTING CHECK — Note detail totals = FS line totals ───────────────
  const noteDetailsByNG = {};
  for (const d of noteDetails) {
    noteDetailsByNG[d.noteGroupId] = (noteDetailsByNG[d.noteGroupId] || 0) + Number(d.finalNet);
  }

  let castingPass = 0, castingFail = 0;
  const castingErrors = [];

  for (const line of fsLines) {
    if (!line.noteGroupId) continue;
    // Use SIGNED comparison — handles contra-assets (provision for bad debts = negative asset)
    // FS line totalFinalNet is the signed sum; NoteDetail sum should match
    const fsAmt   = Number(line.totalFinalNet);
    const noteAmt = noteDetailsByNG[line.noteGroupId] || 0;
    const diff    = Math.abs(fsAmt - noteAmt);
    if (diff < 1) {
      castingPass++;
    } else {
      castingFail++;
      const relatedMappings = mappings.filter(m => m.groupName === line.groupName);
      castingErrors.push({
        groupName:      line.groupName,
        assetLiability: line.assetLiability,
        sheet:          line.sheet,
        fsAmt,
        noteAmt,
        diff,
        subGroupings:   relatedMappings.map(m => m.subGrouping),
        fix: `FS line total is ${fsAmt.toFixed(2)} but note details sum to ${noteAmt.toFixed(2)} (diff: ${diff.toFixed(2)}). Re-generate FS and Notes after fixing mappings.`,
      });
    }
  }

  checks.push({
    engagementId, tbVersionId: tbVersion?.id,
    checkType: 'CASTING',
    status: castingFail === 0 ? 'PASS' : 'FAIL',
    message: castingFail === 0
      ? `✓ Casting check passed — All ${castingPass} notes match their FS line amounts`
      : `✗ Casting errors in ${castingFail} notes — ${castingPass} passed`,
    detail: { passed: castingPass, failed: castingFail, errors: castingErrors },
  });

  // ── 6. RECONCILIATION — Retained Earnings + PAT = Closing RE ─────────────
  const retainedLine = bsLines.find(l =>
    l.assetLiability === 'Equity' &&
    ['retained','surplus','r&s'].some(k => l.groupName?.toLowerCase().includes(k)) &&
    !l.groupName?.toLowerCase().includes('profit')
  );
  const profitLine = bsLines.find(l =>
    l.groupName?.toLowerCase().includes('profit') ||
    l.groupName?.toLowerCase().includes('loss for the year')
  );

  if (retainedLine && profitLine) {
    const openingRE  = Number(retainedLine.totalFinalNet) - Number(profitLine.totalFinalNet);
    const closingRE  = Number(retainedLine.totalFinalNet);
    const reDiff = Math.abs(closingRE - (openingRE + Number(profitLine.totalFinalNet)));
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'RECONCILIATION_RE',
      status: reDiff < 1 ? 'PASS' : 'WARNING',
      message: reDiff < 1
        ? `✓ Retained Earnings reconciles — Opening ${openingRE.toFixed(2)} + Profit ${Number(profitLine.totalFinalNet).toFixed(2)} = Closing ${closingRE.toFixed(2)}`
        : `⚠ Retained Earnings mismatch — Opening ${openingRE.toFixed(2)} + Profit ${Number(profitLine.totalFinalNet).toFixed(2)} ≠ Closing ${closingRE.toFixed(2)} (Diff: ${reDiff.toFixed(2)})`,
      detail: { openingRE, profitForYear: Number(profitLine.totalFinalNet), closingRE, difference: reDiff },
    });
  }

  // ── 7. CASH RECONCILIATION — BS Cash = CFS Closing Cash ──────────────────
  const cashLine = bsLines.find(l => ['cash','bank'].some(k => l.groupName?.toLowerCase().includes(k)) && l.assetLiability === 'Assets');
  if (cashLine) {
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'RECONCILIATION_CASH',
      status: 'INFO',
      message: `BS Cash & Bank: ${Number(cashLine.totalFinalNet).toFixed(2)} — This must equal Cash Flow Statement closing balance`,
      detail: { bsCash: Number(cashLine.totalFinalNet), groupName: cashLine.groupName },
    });
  }

  // ── 8. COMPLETENESS — All FS lines have note groups ──────────────────────
  const incompleteLines = fsLines.filter(l =>
    l.sheet === 'BS' && !l.noteGroupId && !l.groupName?.startsWith('__')
  );
  const linesWithoutNotes = incompleteLines.length;

  // For each incomplete line, find its TB sub-groupings from mappings
  const incompleteDetail = incompleteLines.map(l => {
    const relatedMappings = mappings.filter(m => m.groupName === l.groupName);
    return {
      fsHead:        l.groupName,
      assetLiability: l.assetLiability,
      amount:        Number(l.totalFinalNet),
      subGroupings:  relatedMappings.map(m => m.subGrouping),
      fix:           `Go to Mapping page → find "${l.groupName}" → add a Note Group ID (e.g. NG-${l.groupName.toUpperCase().replace(/[^A-Z0-9]/g,'-').slice(0,15)})`,
    };
  });

  checks.push({
    engagementId, tbVersionId: tbVersion?.id,
    checkType: 'COMPLETENESS',
    status: linesWithoutNotes === 0 ? 'PASS' : 'WARNING',
    message: linesWithoutNotes === 0
      ? `✓ All BS lines have note references — ${fsLines.filter(l=>l.sheet==='BS').length} lines fully linked`
      : `⚠ ${linesWithoutNotes} BS line${linesWithoutNotes>1?'s':''} missing note reference: ${incompleteLines.map(l=>l.groupName).join(', ')}`,
    detail: { linesWithoutNotes, lines: incompleteDetail },
  });

  // ── 9. SIGN CHECK — no negative assets or equity ─────────────────────────
  const negAssets = bsLines.filter(l => l.assetLiability === 'Assets' && Number(l.totalFinalNet) < -1 && !l.groupName?.toLowerCase().includes('provision'));
  const negEquity = bsLines.filter(l => l.assetLiability === 'Equity' && Number(l.totalFinalNet) < -1 && !l.groupName?.toLowerCase().includes('profit') && !l.groupName?.toLowerCase().includes('loss'));

  if (negAssets.length > 0 || negEquity.length > 0) {
    const allNeg = [
      ...negAssets.map(l => ({ name: l.groupName, type: 'Asset', amount: Number(l.totalFinalNet), fix: `"${l.groupName}" is classified as Asset but has negative value. Check if it should be a Liability instead.` })),
      ...negEquity.map(l => ({ name: l.groupName, type: 'Equity', amount: Number(l.totalFinalNet), fix: `"${l.groupName}" is classified as Equity but has negative value. Check mapping classification.` })),
    ];
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'SIGN_CHECK',
      status: 'WARNING',
      message: `⚠ Sign issues: ${allNeg.map(l=>l.name).join(', ')} — check classification in Mapping page`,
      detail: { items: allNeg },
    });
  }

  // ── 10. METHOD-SPECIFIC CHECKS ──────────────────────────────────────────
  // Load engagement method
  const engRows = await prisma.$queryRawUnsafe(
    `SELECT e.method FROM "Engagement" e WHERE e.id = $1 LIMIT 1`, engagementId
  );
  const method = engRows[0]?.method || 'AS';

  // OCI check — required for IND_AS and IFRS, not for AS/IFRS_SME
  if (['IND_AS','IFRS'].includes(method)) {
    const hasOCI = ociLines.length > 0;
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'OCI_CHECK',
      status: hasOCI ? 'PASS' : 'INFO',
      message: hasOCI
        ? `✓ ${ociLines.length} OCI item${ociLines.length>1?'s':''} found — ${method} requires OCI disclosure`
        : `ℹ No OCI items mapped. If there are actuarial gains/losses, FVOCI items, or translation differences, map them to OCI sheet in Mapping page.`,
      detail: { method, ociItems: ociLines.map(l => ({ name: l.groupName, amount: Number(l.totalFinalNet) })) },
    });
  }

  if (['AS','IFRS_SME'].includes(method)) {
    if (ociLines.length > 0) {
      checks.push({
        engagementId, tbVersionId: tbVersion?.id,
        checkType: 'OCI_CHECK',
        status: 'WARNING',
        message: `⚠ ${ociLines.length} OCI item${ociLines.length>1?'s':''} found but ${method} generally does not require OCI. Verify these items.`,
        detail: { method, ociItems: ociLines.map(l => ({ name: l.groupName, amount: Number(l.totalFinalNet) })) },
      });
    }
  }

  // Schedule III check — for AS and IND_AS
  if (['AS','IND_AS'].includes(method)) {
    const hasNCA = bsLines.some(l => l.assetLiability === 'Assets' &&
      ['fixed asset','property','intangible','deferred','long term','investment'].some(k => l.groupName?.toLowerCase().includes(k)));
    const hasCA  = bsLines.some(l => l.assetLiability === 'Assets' &&
      ['cash','bank','inventor','debtor','receivable','current'].some(k => l.groupName?.toLowerCase().includes(k)));
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'SCHEDULE_III',
      status: (hasNCA && hasCA) ? 'PASS' : 'WARNING',
      message: (hasNCA && hasCA)
        ? `✓ Schedule III structure found — Non-current and Current assets both present`
        : `⚠ Schedule III requires separate Non-current and Current classification. Check that assets are mapped with appropriate FS heads.`,
      detail: { method, hasNonCurrentAssets: hasNCA, hasCurrentAssets: hasCA },
    });
  }

  // IFRS IAS 1 check — non-current/current split
  if (['IFRS','IFRS_SME'].includes(method)) {
    const hasNCA = bsLines.some(l => l.assetLiability === 'Assets' &&
      ['property','plant','ppe','intangible','goodwill','right-of-use','deferred'].some(k => l.groupName?.toLowerCase().includes(k)));
    const hasCA  = bsLines.some(l => l.assetLiability === 'Assets' &&
      ['cash','inventor','trade and other receiv','prepay','current'].some(k => l.groupName?.toLowerCase().includes(k)));
    const hasNCL = bsLines.some(l => l.assetLiability === 'Liabilities' &&
      ['long term','deferred tax liab','lease liab','non-current'].some(k => l.groupName?.toLowerCase().includes(k)));
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'IAS1_STRUCTURE',
      status: (hasNCA && hasCA) ? 'PASS' : 'WARNING',
      message: (hasNCA && hasCA)
        ? `✓ IAS 1 structure — Non-current and Current assets classified correctly`
        : `⚠ IAS 1 requires Non-current / Current split. Ensure PPE, Intangibles → Non-current; Cash, Receivables → Current.`,
      detail: { method, hasNCA, hasCA, hasNCL },
    });
  }

  // Revenue recognition check — all methods
  if (totalIncome === 0 && plLines.length > 0) {
    checks.push({
      engagementId, tbVersionId: tbVersion?.id,
      checkType: 'REVENUE_CHECK',
      status: 'WARNING',
      message: `⚠ No revenue/income found in P&L. Verify that income items are mapped with 'Income' classification.`,
      detail: { plLineCount: plLines.length, totalIncome },
    });
  }

  // Save results via raw SQL to bypass enum type mismatch in DB
  await prisma.validationLog.deleteMany({ where: { engagementId } });
  for (const check of checks) {
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "ValidationLog" (id, "engagementId", "tbVersionId", "checkType", status, message, detail, "createdAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4::TEXT, $5, $6::jsonb, NOW())`,
        check.engagementId,
        check.tbVersionId || null,
        check.checkType,
        check.status,
        check.message,
        JSON.stringify(check.detail || {})
      );
    } catch (e) {
      console.warn('[ValidationLog insert]', e.message);
    }
  }

  return checks;
}

async function getValidationResults(engagementId) {
  return prisma.validationLog.findMany({
    where:   { engagementId },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { runAllChecks, getValidationResults };
