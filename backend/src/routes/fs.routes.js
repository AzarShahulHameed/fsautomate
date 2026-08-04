
// src/routes/fs.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { fsGenerationQueue, queueEnabled } = require('../config/queue');
 
// Both services loaded lazily so server starts even if a dependency is missing
function getFsService() {
  return require('../services/fs.service');
}
function getValidationService() {
  try { return require('../services/validation.service'); } catch (_) { return null; }
}
 
router.use(authGuard);
 
// POST /:engagementId/generate — generate FS from mapped TB
//
// Was: ran generateFS() inline, holding the request (and a DB connection)
// for the full computation. Now: enqueues a job on the fs-generation queue
// and returns immediately with a jobId to poll — unless REDIS_URL isn't
// set, in which case it falls back to the old inline behavior so local dev
// without Redis running still works exactly as before.
router.post('/:engagementId/generate', engagementGuard, async (req, res, next) => {
  try {
    if (!queueEnabled) {
      const result = await getFsService().generateFS(req.params.engagementId, req.firmId);
      return res.json(result);
    }
    const job = await fsGenerationQueue.add('generate', {
      engagementId: req.params.engagementId,
      firmId:       req.firmId,
    }, {
      removeOnComplete: { age: 3600 }, // keep completed jobs 1h for status polling, then clean up
      removeOnFail:     { age: 86400 },
    });
    res.status(202).json({ jobId: job.id, status: 'queued' });
  } catch (err) { next(err); }
});
 
// GET /:engagementId/generate-status/:jobId — poll a queued/running generation job
router.get('/:engagementId/generate-status/:jobId', engagementGuard, async (req, res, next) => {
  try {
    if (!queueEnabled) return res.status(404).json({ error: 'Job queue not enabled' });
    const job = await fsGenerationQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found or expired' });

    const state = await job.getState(); // 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
    if (state === 'completed') {
      return res.json({ status: 'completed', result: job.returnvalue });
    }
    if (state === 'failed') {
      return res.json({ status: 'failed', error: job.failedReason || 'Generation failed' });
    }
    res.json({ status: state }); // waiting / active / delayed — frontend keeps polling
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
 