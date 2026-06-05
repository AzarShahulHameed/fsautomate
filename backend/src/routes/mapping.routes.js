// src/routes/mapping.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const mappingService = require('../services/mapping.service');
const memoryService  = require('../services/mappingMemory.service');

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
// Saves a manual mapping AND writes to MappingMemory automatically
router.put('/:engagementId/manual', engagementGuard, async (req, res, next) => {
  try {
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

// GET /api/mapping/master/download?method=AS
router.get('/master/download', authGuard, async (req, res, next) => {
  try {
    const { method } = req.query;
    const rows = await mappingService.loadMasterGrouping(method);

    const header = ['Sub Group No', 'Sub Group Name', 'Group Name', 'Note Group ID', 'Method Applicability'];
    const escape = (v) => {
      const s = String(v == null ? '' : v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [
      header.join(','),
      ...rows.map(r => [r.subGroupNo, r.subGroupName, r.groupName, r.noteGroupId || '', r.methodApplicability || ''].map(escape).join(',')),
    ];
    const csv      = lines.join('\r\n');
    const filename = method ? `FS-Groupings-${method}.csv` : 'FS-Groupings.csv';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv);
  } catch (err) { next(err); }
});

// ── Memory routes ─────────────────────────────────────────────────────────────

// GET /api/mapping/:engagementId/memory/stats
// Returns how much the system has learned for this firm + method
router.get('/:engagementId/memory/stats', engagementGuard, async (req, res, next) => {
  try {
    const method  = req.engagement.method;
    const firmId  = req.firmId;
    const stats   = await memoryService.getMemoryStats(firmId, method);
    res.json(stats);
  } catch (err) { next(err); }
});

// POST /api/mapping/:engagementId/memory/suggest
// Given a list of subGroupings, returns memory suggestions without applying them
// Used by the UI to show confidence badges before the user accepts
router.post('/:engagementId/memory/suggest', engagementGuard, async (req, res, next) => {
  try {
    const { subGroupings } = req.body;
    if (!Array.isArray(subGroupings)) return res.status(400).json({ error: 'subGroupings array required' });

    const method   = req.engagement.method;
    const firmId   = req.firmId;
    const clientId = req.engagement.clientId;

    const result = await memoryService.applyMemoryToUnmapped(subGroupings, firmId, clientId, method);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
