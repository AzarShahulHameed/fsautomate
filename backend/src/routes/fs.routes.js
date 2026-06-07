
// src/routes/fs.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
 
// Both services loaded lazily so server starts even if a dependency is missing
function getFsService() {
  return require('../services/fs.service');
}
function getValidationService() {
  try { return require('../services/validation.service'); } catch (_) { return null; }
}
 
router.use(authGuard);
 
// POST /:engagementId/generate — generate FS from mapped TB
router.post('/:engagementId/generate', engagementGuard, async (req, res, next) => {
  try {
    const result = await getFsService().generateFS(req.params.engagementId, req.firmId);
    res.json(result);
  } catch (err) { next(err); }
});
 
// GET /:engagementId — get existing FS lines with PY enrichment
router.get('/:engagementId', engagementGuard, async (req, res, next) => {
  try {
    const result = await getFsService().getFS(req.params.engagementId, req.firmId);
    res.json(result);
  } catch (err) { next(err); }
});
 
// POST /:engagementId/validate — run validation checks
router.post('/:engagementId/validate', engagementGuard, async (req, res, next) => {
  try {
    const validationService = getValidationService();
    if (!validationService) return res.json({ checks: [], message: 'Validation service not available' });
    const { tbVersionId } = req.body;
    const checks = await validationService.runAllChecks(req.params.engagementId, tbVersionId);
    res.json({ checks });
  } catch (err) { next(err); }
});
 
// GET /:engagementId/check — quick BS tally check
router.get('/:engagementId/check', engagementGuard, async (req, res, next) => {
  try {
    const { prisma } = require('../config/db');
    const lines = await prisma.fSLine.findMany({
      where: { engagementId: req.params.engagementId, isPriorYear: false },
    });
    const assets = lines.filter(l=>l.assetLiability==='Assets'&&l.sheet==='BS').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
    const equity = lines.filter(l=>l.assetLiability==='Equity'&&l.sheet==='BS').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
    const liab   = lines.filter(l=>l.assetLiability==='Liabilities'&&l.sheet==='BS').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
    const diff   = assets - equity - liab;
    res.json({ assets, equity, liab, diff, balanced: Math.abs(diff) < 1 });
  } catch (err) { next(err); }
});
 
module.exports = router;
 