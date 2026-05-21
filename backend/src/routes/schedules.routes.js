'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { prisma } = require('../config/db');
const { v4: uuid } = require('uuid');
 
router.use(authGuard);
 
// ── DEBUG: Test route without engagementGuard ─────────────────────────────────
router.get('/test/:engagementId', async (req, res, next) => {
  try {
    const { engagementId } = req.params;
    // Check engagement exists at all
    const eng = await prisma.$queryRawUnsafe(
      `SELECT e.id, e.method, e.name, c."firmId", c.name as "clientName"
       FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
       WHERE e.id = $1 LIMIT 1`, engagementId
    );
    const userFirmId = req.user?.firmId;
    res.json({ 
      engagement: eng[0] || null, 
      userFirmId,
      firmMatch: eng[0]?.firmId === userFirmId,
      message: eng.length ? 'Engagement found' : 'Engagement NOT found in DB'
    });
  } catch (err) { next(err); }
});
 
// ── PPE ───────────────────────────────────────────────────────────────────────
router.get('/:engagementId/ppe', engagementGuard, async (req, res, next) => {
  try {
    const items = await prisma.pPEClass.findMany({
      where: { engagementId: req.params.engagementId },
      orderBy: { displayOrder: 'asc' },
    });
    // Auto-init with standard asset classes if empty
    if (items.length === 0) {
      const engRows = await prisma.$queryRawUnsafe(
        `SELECT method FROM "Engagement" WHERE id = $1 LIMIT 1`, req.params.engagementId
      );
      const isIFRS = ['IFRS','IFRS_SME','IND_AS'].includes(engRows[0]?.method);
      const defaults = [
        { assetClass: 'Land and Land Development', isDepreciable: false, displayOrder: 1 },
        { assetClass: 'Buildings', isDepreciable: true, displayOrder: 2, method: 'SLM', usefulLife: '30 years' },
        { assetClass: 'Plant and Machinery', isDepreciable: true, displayOrder: 3, method: 'SLM', usefulLife: '15 years' },
        { assetClass: 'Furniture and Fixtures', isDepreciable: true, displayOrder: 4, method: 'SLM', usefulLife: '10 years' },
        { assetClass: 'Vehicles', isDepreciable: true, displayOrder: 5, method: 'SLM', usefulLife: '8 years' },
        { assetClass: 'Office Equipment', isDepreciable: true, displayOrder: 6, method: 'SLM', usefulLife: '5 years' },
        { assetClass: 'Computers and IT Equipment', isDepreciable: true, displayOrder: 7, method: 'SLM', usefulLife: '3 years' },
        ...(isIFRS ? [{ assetClass: 'Right-of-Use Assets', isDepreciable: true, displayOrder: 8, method: 'SLM', usefulLife: 'Lease term' }] : []),
        { assetClass: 'Capital Work-in-Progress', isDepreciable: false, displayOrder: isIFRS ? 9 : 8 },
      ];
      await prisma.pPEClass.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: req.params.engagementId, ...d })),
      });
      return res.json(await prisma.pPEClass.findMany({ where: { engagementId: req.params.engagementId }, orderBy: { displayOrder: 'asc' } }));
    }
    res.json(items);
  } catch (err) { 
    console.error('[PPE GET Error]', err.message, err.code);
    next(err); 
  }
});
 
router.put('/:engagementId/ppe/:id', engagementGuard, async (req, res, next) => {
  try {
    const { assetClass, isDepreciable, displayOrder, openingGross, additions, disposals,
            openingDepr, deprForYear, deprOnDisposal, revaluationAmt, impairmentAmt,
            usefulLife, method, rate } = req.body;
    await prisma.pPEClass.updateMany({
      where: { id: req.params.id, engagementId: req.params.engagementId },
      data: { assetClass, isDepreciable, displayOrder, openingGross, additions, disposals,
              openingDepr, deprForYear, deprOnDisposal, revaluationAmt, impairmentAmt,
              usefulLife, method, rate, updatedAt: new Date() },
    });
    res.json({ saved: true });
  } catch (err) { next(err); }
});
 
router.post('/:engagementId/ppe', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.pPEClass.count({ where: { engagementId: req.params.engagementId } });
    const item = await prisma.pPEClass.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(item);
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
    let items = await prisma.intangibleClass.findMany({
      where: { engagementId: req.params.engagementId },
      orderBy: { displayOrder: 'asc' },
    });
    if (items.length === 0) {
      const defaults = [
        { assetClass: 'Goodwill', isIndefinite: true, displayOrder: 1 },
        { assetClass: 'Computer Software', usefulLife: '3-5 years', displayOrder: 2 },
        { assetClass: 'Trademarks and Brand Names', usefulLife: '10 years', displayOrder: 3 },
        { assetClass: 'Customer Relationships', usefulLife: '5 years', displayOrder: 4 },
        { assetClass: 'Patents and Licences', usefulLife: 'Useful life', displayOrder: 5 },
        { assetClass: 'Other Intangibles', displayOrder: 6 },
      ];
      await prisma.intangibleClass.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: req.params.engagementId, ...d })),
      });
      items = await prisma.intangibleClass.findMany({ where: { engagementId: req.params.engagementId }, orderBy: { displayOrder: 'asc' } });
    }
    res.json(items);
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
    res.json({ saved: true });
  } catch (err) { next(err); }
});
 
router.post('/:engagementId/intangibles', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.intangibleClass.count({ where: { engagementId: req.params.engagementId } });
    const item = await prisma.intangibleClass.create({
      data: { id: uuid(), engagementId: req.params.engagementId, displayOrder: count + 1, ...req.body },
    });
    res.json(item);
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
      where: { engagementId: req.params.engagementId },
      include: { transactions: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(parties);
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
      data: { name, relationship, holdingPct, panOrReg, country, isActive, updatedAt: new Date() },
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
 
// ── RP TRANSACTIONS ───────────────────────────────────────────────────────────
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
      data: { transactionType, description, amountCY, amountPY, outstandingDr,
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
 
// ── EPS ───────────────────────────────────────────────────────────────────────
router.get('/:engagementId/eps', engagementGuard, async (req, res, next) => {
  try {
    let eps = await prisma.ePSData.findFirst({ where: { engagementId: req.params.engagementId } });
    if (!eps) {
      // Auto-fill PAT from P&L
      const plLines = await prisma.fSLine.findMany({ where: { engagementId: req.params.engagementId, sheet: 'PL' } });
      const revenue = plLines.filter(l=>['revenue from operations','other income'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet),0);
      const expenses = plLines.filter(l=>['cost of material','employee','finance cost','depreciation','other expenses','tax expense'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet),0);
      const pat = revenue - expenses;
      eps = await prisma.ePSData.create({ data: { id: uuid(), engagementId: req.params.engagementId, patFromPL: pat } });
    }
    res.json(eps);
  } catch (err) { next(err); }
});
 
router.put('/:engagementId/eps', engagementGuard, async (req, res, next) => {
  try {
    const eps = await prisma.ePSData.upsert({
      where: { engagementId: req.params.engagementId },
      update: { ...req.body, updatedAt: new Date() },
      create: { id: uuid(), engagementId: req.params.engagementId, ...req.body },
    });
    res.json(eps);
  } catch (err) { next(err); }
});
 
// ── DEFERRED TAX ──────────────────────────────────────────────────────────────
router.get('/:engagementId/deferred-tax', engagementGuard, async (req, res, next) => {
  try {
    let items = await prisma.deferredTaxItem.findMany({
      where: { engagementId: req.params.engagementId },
      orderBy: [{ isAsset: 'desc' }, { displayOrder: 'asc' }],
    });
    if (items.length === 0) {
      const defaults = [
        { description: 'Depreciation difference (WDV vs SLM)', isAsset: false, displayOrder: 1 },
        { description: 'Provision for gratuity / leave encashment', isAsset: true, displayOrder: 2 },
        { description: 'Provision for doubtful debts / ECL', isAsset: true, displayOrder: 3 },
        { description: 'Lease liabilities (Ind AS 116 / IFRS 16)', isAsset: true, displayOrder: 4 },
        { description: 'Other temporary differences', isAsset: true, displayOrder: 5 },
      ];
      await prisma.deferredTaxItem.createMany({
        data: defaults.map(d => ({ id: uuid(), engagementId: req.params.engagementId, ...d })),
      });
      items = await prisma.deferredTaxItem.findMany({ where: { engagementId: req.params.engagementId }, orderBy: [{ isAsset: 'desc' },{ displayOrder: 'asc' }] });
    }
    res.json(items);
  } catch (err) { next(err); }
});
 
router.post('/:engagementId/deferred-tax', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.deferredTaxItem.count({ where: { engagementId: req.params.engagementId } });
    const item = await prisma.deferredTaxItem.create({
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
      data: { description, isAsset, displayOrder, openingDiff, createdInPL,
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
 
// ── FINANCIAL INSTRUMENTS (Ind AS / IFRS only) ────────────────────────────────
router.get('/:engagementId/financial-instruments', engagementGuard, async (req, res, next) => {
  try {
    let fi = await prisma.financialInstrumentNote.findFirst({ where: { engagementId: req.params.engagementId } });
    if (!fi) {
      fi = await prisma.financialInstrumentNote.create({ data: { id: uuid(), engagementId: req.params.engagementId } });
    }
    res.json(fi);
  } catch (err) { next(err); }
});
 
router.put('/:engagementId/financial-instruments', engagementGuard, async (req, res, next) => {
  try {
    const fi = await prisma.financialInstrumentNote.upsert({
      where: { engagementId: req.params.engagementId },
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
      where: { engagementId: req.params.engagementId },
      orderBy: [{ contingencyType: 'asc' }, { displayOrder: 'asc' }],
    });
    res.json(items);
  } catch (err) { next(err); }
});
 
router.post('/:engagementId/contingencies', engagementGuard, async (req, res, next) => {
  try {
    const count = await prisma.contingency.count({ where: { engagementId: req.params.engagementId } });
    const item = await prisma.contingency.create({
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
      data: { contingencyType, category, description, amount, remarks, displayOrder, updatedAt: new Date() },
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