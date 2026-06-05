// src/routes/schedules.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// MNC-level changes:
//   1. Every schedule GET now returns `_anchors` (expected closing from FSLine)
//      and `_pyOpenings` (PY closing = CY opening pre-population data)
//   2. EPS GET now reads PAT directly from FSLine via getPATFromFSLine()
//      instead of re-summing P&L items with keyword matching
//   3. isPriorYear: false filter on all FSLine queries inside EPS
//   4. Schedule GET responses include `_reconciliation` object showing
//      whether the schedule balances against the TB
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { prisma } = require('../config/db');
const { v4: uuid } = require('uuid');
const {
  getScheduleAnchors,
  getPYOpeningBalances,
  getPATFromFSLine,
  getScheduleCastingErrors,
} = require('../services/schedule.service');

router.use(authGuard);

// ── Helper: compute PPE row closing values ────────────────────────────────────
function calcPPERow(r) {
  // exchDiff: exchange differences for IFRS entities with foreign currency PPE
  // Stored in-memory for IFRS display — not persisted (not in schema) to keep AS/Ind AS clean
  const exchDiff    = Number(r.exchDiff || 0);
  const closingGross = Number(r.openingGross || 0) + Number(r.additions || 0)
    - Number(r.disposals || 0) + Number(r.revaluationAmt || 0) + exchDiff;
  const closingDepr  = r.isDepreciable
    ? Number(r.openingDepr || 0) + Number(r.deprForYear || 0) - Number(r.deprOnDisposal || 0)
    : 0;
  const netCY = closingGross - closingDepr - Number(r.impairmentAmt || 0);
  const netPY = Number(r.openingGross || 0) - Number(r.openingDepr || 0);
  return { ...r, closingGross, closingDepr, netCY, netPY, exchDiff };
}

function calcIntangRow(r) {
  const closingGross = Number(r.openingGross || 0) + Number(r.additions || 0) - Number(r.disposals || 0);
  const closingAmort = r.isIndefinite ? 0
    : Number(r.openingAmort || 0) + Number(r.amortForYear || 0) - Number(r.amortOnDisposal || 0);
  const netCY = closingGross - closingAmort - Number(r.impairmentAmt || 0);
  const netPY = Number(r.openingGross || 0) - Number(r.openingAmort || 0);
  return { ...r, closingGross, closingAmort, netCY, netPY };
}

// ── PPE ───────────────────────────────────────────────────────────────────────
router.get('/:engagementId/ppe', engagementGuard, async (req, res, next) => {
  try {
    const eid = req.params.engagementId;
    let items = await prisma.pPEClass.findMany({
      where: { engagementId: eid },
      orderBy: { displayOrder: 'asc' },
    });

    // Auto-init if empty — method-aware defaults
    if (items.length === 0) {
      const method = req.engagement.method;
      const isIFRS = ['IFRS', 'IFRS_SME'].includes(method);
      const isIndAS = method === 'IND_AS';
      const hasROU  = isIFRS || isIndAS;

      const defaults = [
        { assetClass: 'Land',                        isDepreciable: false, displayOrder: 1 },
        { assetClass: 'Buildings',                   isDepreciable: true,  displayOrder: 2,  method: 'SLM', usefulLife: isIFRS ? '20-50 years' : '30 years',  rate: isIFRS ? null : 3.34  },
        { assetClass: 'Plant and Machinery',         isDepreciable: true,  displayOrder: 3,  method: 'SLM', usefulLife: isIFRS ? '5-20 years'  : '15 years',  rate: isIFRS ? null : 6.67  },
        { assetClass: 'Furniture and Fixtures',      isDepreciable: true,  displayOrder: 4,  method: 'SLM', usefulLife: isIFRS ? '5-10 years'  : '10 years',  rate: isIFRS ? null : 10.00 },
        { assetClass: 'Vehicles',                    isDepreciable: true,  displayOrder: 5,  method: 'SLM', usefulLife: isIFRS ? '4-8 years'   : '8 years',   rate: isIFRS ? null : 12.50 },
        { assetClass: 'Office Equipment',            isDepreciable: true,  displayOrder: 6,  method: 'SLM', usefulLife: isIFRS ? '3-5 years'   : '5 years',   rate: isIFRS ? null : 20.00 },
        { assetClass: 'Computers and IT Equipment',  isDepreciable: true,  displayOrder: 7,  method: 'SLM', usefulLife: isIFRS ? '3-5 years'   : '3 years',   rate: isIFRS ? null : 33.33 },
        ...(hasROU ? [{ assetClass: 'Right-of-Use Assets — Lease (IFRS 16 / Ind AS 116)', isDepreciable: true, displayOrder: 8, method: 'SLM', usefulLife: 'Lease term' }] : []),
        { assetClass: 'Capital Work-in-Progress',    isDepreciable: false, displayOrder: hasROU ? 9 : 8 },
      ];

      await prisma.pPEClass.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: eid, ...d })),
      });
      items = await prisma.pPEClass.findMany({ where: { engagementId: eid }, orderBy: { displayOrder: 'asc' } });
    }

    // Enrich with closing calculations
    const calc = items.map(calcPPERow);

    // Get TB anchors and PY openings
    const [anchors, pyOpenings] = await Promise.all([
      getScheduleAnchors(eid),
      getPYOpeningBalances(eid),
    ]);

    const expectedClosing = anchors.ppe?.amount ?? null;
    const actualClosing   = calc.reduce((s, r) => s + r.netCY, 0);
    const reconcDiff      = expectedClosing !== null ? actualClosing - expectedClosing : null;

    res.json({
      rows: calc,
      _anchors:        anchors.ppe,
      _pyOpenings:     pyOpenings?.ppe || null,
      _reconciliation: {
        actualClosing,
        expectedClosing,
        difference:  reconcDiff,
        balanced:    reconcDiff !== null ? Math.abs(reconcDiff) < 1 : null,
        message:     reconcDiff === null ? 'Generate Financial Statements first to enable reconciliation'
          : Math.abs(reconcDiff) < 1 ? 'PPE schedule tallies with Balance Sheet ✓'
          : `PPE schedule (${actualClosing.toFixed(2)}) differs from Balance Sheet (${expectedClosing.toFixed(2)}) by ${reconcDiff.toFixed(2)}`,
      },
    });
  } catch (err) { next(err); }
});

router.put('/:engagementId/ppe/:id', engagementGuard, async (req, res, next) => {
  try {
    // Note: exchDiff is intentionally excluded — it's an IFRS display field, not persisted
    const { assetClass, isDepreciable, displayOrder, openingGross, additions, disposals,
            openingDepr, deprForYear, deprOnDisposal, revaluationAmt, impairmentAmt,
            usefulLife, method: assetMethod, rate } = req.body;
    await prisma.pPEClass.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data: { assetClass, isDepreciable, displayOrder, openingGross, additions, disposals,
              openingDepr, deprForYear, deprOnDisposal, revaluationAmt, impairmentAmt,
              usefulLife, method: assetMethod, rate, updatedAt: new Date() },
    });
    const updated = await prisma.pPEClass.findUnique({ where: { id: req.params.id } });
    res.json(calcPPERow(updated));
  } catch (err) { next(err); }
});

router.post('/:engagementId/ppe', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.pPEClass.count({ where: { engagementId: req.params.engagementId } });
    const item  = await prisma.pPEClass.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(calcPPERow(item));
  } catch (err) { next(err); }
});

router.delete('/:engagementId/ppe/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.pPEClass.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── INTANGIBLES ───────────────────────────────────────────────────────────────
router.get('/:engagementId/intangibles', engagementGuard, async (req, res, next) => {
  try {
    const eid = req.params.engagementId;
    let items = await prisma.intangibleClass.findMany({
      where: { engagementId: eid },
      orderBy: { displayOrder: 'asc' },
    });

    if (items.length === 0) {
      const defaults = [
        { assetClass: 'Goodwill',                    isIndefinite: true,  displayOrder: 1 },
        { assetClass: 'Computer Software',           usefulLife: '3-5 years', displayOrder: 2 },
        { assetClass: 'Trademarks and Brand Names',  usefulLife: '10 years',  displayOrder: 3 },
        { assetClass: 'Customer Relationships',      usefulLife: '5 years',   displayOrder: 4 },
        { assetClass: 'Patents and Licences',        usefulLife: 'Legal life', displayOrder: 5 },
        { assetClass: 'Other Intangibles',           displayOrder: 6 },
      ];
      await prisma.intangibleClass.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: eid, ...d })),
      });
      items = await prisma.intangibleClass.findMany({ where: { engagementId: eid }, orderBy: { displayOrder: 'asc' } });
    }

    const calc = items.map(calcIntangRow);

    const [anchors, pyOpenings] = await Promise.all([
      getScheduleAnchors(eid),
      getPYOpeningBalances(eid),
    ]);

    const expectedClosing = anchors.intangibles?.amount ?? null;
    const actualClosing   = calc.reduce((s, r) => s + r.netCY, 0);
    const reconcDiff      = expectedClosing !== null ? actualClosing - expectedClosing : null;

    res.json({
      rows: calc,
      _anchors:        anchors.intangibles,
      _pyOpenings:     pyOpenings?.intangibles || null,
      _reconciliation: {
        actualClosing,
        expectedClosing,
        difference:  reconcDiff,
        balanced:    reconcDiff !== null ? Math.abs(reconcDiff) < 1 : null,
        message:     reconcDiff === null ? 'Generate Financial Statements first to enable reconciliation'
          : Math.abs(reconcDiff) < 1 ? 'Intangibles schedule tallies with Balance Sheet ✓'
          : `Intangibles schedule (${actualClosing.toFixed(2)}) differs from Balance Sheet (${expectedClosing.toFixed(2)}) by ${reconcDiff.toFixed(2)}`,
      },
    });
  } catch (err) { next(err); }
});

router.put('/:engagementId/intangibles/:id', engagementGuard, async (req, res, next) => {
  try {
    const { assetClass, displayOrder, openingGross, additions, disposals,
            openingAmort, amortForYear, amortOnDisposal, impairmentAmt,
            usefulLife, isIndefinite, impairmentTest } = req.body;
    await prisma.intangibleClass.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data: { assetClass, displayOrder, openingGross, additions, disposals,
              openingAmort, amortForYear, amortOnDisposal, impairmentAmt,
              usefulLife, isIndefinite, impairmentTest, updatedAt: new Date() },
    });
    const updated = await prisma.intangibleClass.findUnique({ where: { id: req.params.id } });
    res.json(calcIntangRow(updated));
  } catch (err) { next(err); }
});

router.post('/:engagementId/intangibles', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.intangibleClass.count({ where: { engagementId: req.params.engagementId } });
    const item  = await prisma.intangibleClass.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(calcIntangRow(item));
  } catch (err) { next(err); }
});

router.delete('/:engagementId/intangibles/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.intangibleClass.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── RELATED PARTIES ───────────────────────────────────────────────────────────
router.get('/:engagementId/related-parties', engagementGuard, async (req, res, next) => {
  try {
    const parties = await prisma.relatedParty.findMany({
      where:   { engagementId: req.params.engagementId },
      include: { transactions: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    // Enrich with TB outstanding balances for cross-reference
    const anchors = await getScheduleAnchors(req.params.engagementId);
    res.json({ parties, _anchors: { tradeReceivables: anchors.tradeReceivables, tradePayables: anchors.tradePayables } });
  } catch (err) { next(err); }
});

router.post('/:engagementId/related-parties', engagementGuard, async (req, res, next) => {
  try {
    const party = await prisma.relatedParty.create({
      data: { id: uuid(), engagementId: req.params.engagementId, ...req.body },
    });
    res.json(party);
  } catch (err) { next(err); }
});

router.put('/:engagementId/related-parties/:id', engagementGuard, async (req, res, next) => {
  try {
    const { name, relationship, holdingPct, panOrReg, country, isActive } = req.body;
    await prisma.relatedParty.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data:  { name, relationship, holdingPct, panOrReg, country, isActive, updatedAt: new Date() },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

router.delete('/:engagementId/related-parties/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.rPTransaction.deleteMany({ where: { relatedPartyId: req.params.id } });
    await prisma.relatedParty.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/:engagementId/related-parties/:partyId/transactions', engagementGuard, async (req, res, next) => {
  try {
    const tx = await prisma.rPTransaction.create({
      data: { id: uuid(), engagementId: req.params.engagementId, relatedPartyId: req.params.partyId, ...req.body },
    });
    res.json(tx);
  } catch (err) { next(err); }
});

router.put('/:engagementId/transactions/:id', engagementGuard, async (req, res, next) => {
  try {
    const { transactionType, description, amountCY, amountPY, outstandingDr,
            outstandingCr, isArmLength, remarks } = req.body;
    await prisma.rPTransaction.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data:  { transactionType, description, amountCY, amountPY, outstandingDr,
               outstandingCr, isArmLength, remarks, updatedAt: new Date() },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

router.delete('/:engagementId/transactions/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.rPTransaction.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── EPS — now reads PAT directly from FSLine ──────────────────────────────────
router.get('/:engagementId/eps', engagementGuard, async (req, res, next) => {
  try {
    const eid = req.params.engagementId;
    let eps   = await prisma.ePSData.findFirst({ where: { engagementId: eid } });

    // Get authoritative PAT from FSLine (not keyword-summed P&L lines)
    const { recommended: fsPAT, pat: computedPAT } = await getPATFromFSLine(eid);

    if (!eps) {
      // First time: create with PAT pre-filled from FSLine
      eps = await prisma.ePSData.create({
        data: { id: uuid(), engagementId: eid, patFromPL: fsPAT },
      });
    } else {
      // Check if FSLine PAT has changed since last save
      const storedPAT = Number(eps.patFromPL || 0);
      if (Math.abs(storedPAT - fsPAT) > 1) {
        // Auto-update PAT from FSLine — user cannot override this field
        await prisma.ePSData.update({
          where: { id: eps.id },
          data:  { patFromPL: fsPAT, updatedAt: new Date() },
        });
        eps = { ...eps, patFromPL: fsPAT };
      }
    }

    // Also get PY PAT from PY FSLine
    const pyFSLines  = await prisma.fSLine.findMany({
      where: { engagementId: eid, isPriorYear: true, sheet: 'PL' },
    });
    const pyIncome  = pyFSLines.filter(l => l.assetLiability === 'Income').reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    const pyExpense = pyFSLines.filter(l => l.assetLiability === 'Expenses').reduce((s, l) => s + Number(l.totalFinalNet || 0), 0);
    const pyFSPAT   = pyFSLines.length > 0 ? pyIncome - pyExpense : null;

    res.json({
      ...eps,
      _fsPAT:    fsPAT,         // what FSLine says — read-only reference
      _pyFsPAT:  pyFSPAT,       // PY PAT from PY FSLine — suggested for patPY field
      _patNote:  'PAT is automatically synchronised from the generated Financial Statements. Re-generate FS to update.',
    });
  } catch (err) { next(err); }
});

router.put('/:engagementId/eps', engagementGuard, async (req, res, next) => {
  try {
    // Never allow patFromPL to be overridden by user — it comes from FSLine
    const { patFromPL: _ignored, ...userFields } = req.body;
    const fsPAT = (await getPATFromFSLine(req.params.engagementId)).recommended;

    const eps = await prisma.ePSData.upsert({
      where:  { engagementId: req.params.engagementId },
      update: { ...userFields, patFromPL: fsPAT, updatedAt: new Date() },
      create: { id: uuid(), engagementId: req.params.engagementId, ...userFields, patFromPL: fsPAT },
    });
    res.json(eps);
  } catch (err) { next(err); }
});

// ── DEFERRED TAX ──────────────────────────────────────────────────────────────
router.get('/:engagementId/deferred-tax', engagementGuard, async (req, res, next) => {
  try {
    const eid = req.params.engagementId;
    let items = await prisma.deferredTaxItem.findMany({
      where:   { engagementId: eid },
      orderBy: [{ isAsset: 'desc' }, { displayOrder: 'asc' }],
    });

    if (items.length === 0) {
      const defaults = [
        { description: 'Depreciation difference (Book WDV vs Tax WDV)',    isAsset: false, displayOrder: 1, taxRate: 25 },
        { description: 'Provision for gratuity / leave encashment',         isAsset: true,  displayOrder: 2, taxRate: 25 },
        { description: 'Provision for doubtful debts / Expected Credit Loss', isAsset: true, displayOrder: 3, taxRate: 25 },
        { description: 'Right-of-Use Asset vs Lease Liability (Ind AS 116 / IFRS 16)', isAsset: true, displayOrder: 4, taxRate: 25 },
        { description: 'Other temporary differences',                       isAsset: true,  displayOrder: 5, taxRate: 25 },
      ];
      await prisma.deferredTaxItem.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: eid, ...d })),
      });
      items = await prisma.deferredTaxItem.findMany({
        where: { engagementId: eid },
        orderBy: [{ isAsset: 'desc' }, { displayOrder: 'asc' }],
      });
    }

    // Compute closing DT for each item
    const calc = items.map(r => {
      const rate    = Number(r.taxRate || 0) / 100;
      const opening = Number(r.openingDiff || 0) * rate;
      const pl      = (Number(r.createdInPL || 0) - Number(r.reversedInPL || 0)) * rate;
      const oci     = (Number(r.createdInOCI || 0) - Number(r.reversedInOCI || 0)) * rate;
      const closing = opening + pl + oci;
      return { ...r, openingTaxEffect: opening, plTaxEffect: pl, ociTaxEffect: oci, closingTaxEffect: closing };
    });

    const [anchors, pyOpenings] = await Promise.all([
      getScheduleAnchors(eid),
      getPYOpeningBalances(eid),
    ]);

    const scheduleNetDT = calc.reduce((s, r) => r.isAsset ? s + r.closingTaxEffect : s - r.closingTaxEffect, 0);
    const fsDTA         = anchors.dta?.amount ?? 0;
    const fsDTL         = anchors.dtl?.amount ?? 0;
    const fsNetDT       = fsDTA - fsDTL;
    const reconcDiff    = anchors.dta.hasData || anchors.dtl.hasData ? scheduleNetDT - fsNetDT : null;

    res.json({
      items: calc,
      _anchors:        { dta: anchors.dta, dtl: anchors.dtl },
      _pyOpenings:     pyOpenings ? { dta: pyOpenings.dta, dtl: pyOpenings.dtl } : null,
      _reconciliation: {
        scheduleNetDT,
        fsNetDT,
        difference: reconcDiff,
        balanced:   reconcDiff !== null ? Math.abs(reconcDiff) < 1 : null,
        message:    reconcDiff === null ? 'Generate Financial Statements first to enable reconciliation'
          : Math.abs(reconcDiff) < 1 ? 'Deferred tax working tallies with Balance Sheet ✓'
          : `DT working net (${scheduleNetDT.toFixed(2)}) differs from BS net DTA/DTL (${fsNetDT.toFixed(2)}) by ${reconcDiff.toFixed(2)}`,
      },
    });
  } catch (err) { next(err); }
});

router.post('/:engagementId/deferred-tax', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.deferredTaxItem.count({ where: { engagementId: req.params.engagementId } });
    const item  = await prisma.deferredTaxItem.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(item);
  } catch (err) { next(err); }
});

router.put('/:engagementId/deferred-tax/:id', engagementGuard, async (req, res, next) => {
  try {
    const { description, isAsset, displayOrder, openingDiff, createdInPL,
            reversedInPL, createdInOCI, reversedInOCI, taxRate } = req.body;
    await prisma.deferredTaxItem.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data:  { description, isAsset, displayOrder, openingDiff, createdInPL,
               reversedInPL, createdInOCI, reversedInOCI, taxRate, updatedAt: new Date() },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

router.delete('/:engagementId/deferred-tax/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.deferredTaxItem.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── FINANCIAL INSTRUMENTS ─────────────────────────────────────────────────────
router.get('/:engagementId/financial-instruments', engagementGuard, async (req, res, next) => {
  try {
    let fi = await prisma.financialInstrumentNote.findFirst({ where: { engagementId: req.params.engagementId } });
    if (!fi) fi = await prisma.financialInstrumentNote.create({ data: { id: uuid(), engagementId: req.params.engagementId } });
    const anchors = await getScheduleAnchors(req.params.engagementId);
    res.json({ ...fi, _anchors: { tradeReceivables: anchors.tradeReceivables, ltBorrowings: anchors.ltBorrowings, stBorrowings: anchors.stBorrowings } });
  } catch (err) { next(err); }
});

router.put('/:engagementId/financial-instruments', engagementGuard, async (req, res, next) => {
  try {
    const fi = await prisma.financialInstrumentNote.upsert({
      where:  { engagementId: req.params.engagementId },
      update: { ...req.body, updatedAt: new Date() },
      create: { id: uuid(), engagementId: req.params.engagementId, ...req.body },
    });
    res.json(fi);
  } catch (err) { next(err); }
});

// ── CONTINGENCIES ─────────────────────────────────────────────────────────────
router.get('/:engagementId/contingencies', engagementGuard, async (req, res, next) => {
  try {
    const items = await prisma.contingency.findMany({
      where:   { engagementId: req.params.engagementId },
      orderBy: [{ contingencyType: 'asc' }, { displayOrder: 'asc' }],
    });
    res.json(items);
  } catch (err) { next(err); }
});

router.post('/:engagementId/contingencies', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.contingency.count({ where: { engagementId: req.params.engagementId } });
    const item  = await prisma.contingency.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(item);
  } catch (err) { next(err); }
});

router.put('/:engagementId/contingencies/:id', engagementGuard, async (req, res, next) => {
  try {
    const { contingencyType, category, description, amount, remarks, displayOrder } = req.body;
    await prisma.contingency.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data:  { contingencyType, category, description, amount, remarks, displayOrder, updatedAt: new Date() },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});

router.delete('/:engagementId/contingencies/:id', engagementGuard, async (req, res, next) => {
  try {
    await prisma.contingency.deleteMany({ where: { id: req.params.id, engagementId: req.params.engagementId } });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

module.exports = router;
