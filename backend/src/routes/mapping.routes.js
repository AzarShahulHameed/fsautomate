// src/routes/mapping.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const mappingService = require('../services/mapping.service');

router.use(authGuard);

// GET /api/mapping/:engagementId/status
router.get('/:engagementId/status', engagementGuard, async (req, res, next) => {
  try {
    const status = await mappingService.getMappingStatus(req.params.engagementId);
    res.json(status);
  } catch (err) { next(err); }
});

// POST /api/mapping/:engagementId/auto
router.post('/:engagementId/auto', engagementGuard, async (req, res, next) => {
  try {
    const method = req.engagement.method;
    let result;
    if (method === 'AS' || method === 'IND_AS') {
      result = await mappingService.autoMapFromMaster(req.params.engagementId, method);
    } else {
      result = await mappingService.autoMapIFRS(req.params.engagementId);
    }
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /api/mapping/:engagementId/manual
router.put('/:engagementId/manual', engagementGuard, async (req, res, next) => {
  try {
    // req.body = { tbRowId, groupName, subGroupName, subGroupNo, noteGroupId }
    const result = await mappingService.saveManualMapping(req.params.engagementId, req.body);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/mapping/master?method=AS&search=borrowings
router.get('/master', authGuard, async (req, res, next) => {
  try {
    const { method, search } = req.query;
    const rows = await mappingService.loadMasterGrouping(method, search);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
