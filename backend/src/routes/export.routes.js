// src/routes/export.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { exportWord, exportExcel } = require('../services/export.service');

router.use(authGuard);

// GET /api/export/:engagementId/word
router.get('/:engagementId/word', engagementGuard, async (req, res, next) => {
  try {
    const buffer = await exportWord(req.params.engagementId, req.firmId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="financial-statements-${req.params.engagementId}.docx"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

// GET /api/export/:engagementId/excel
router.get('/:engagementId/excel', engagementGuard, async (req, res, next) => {
  try {
    const buffer = await exportExcel(req.params.engagementId, req.firmId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-statements-${req.params.engagementId}.xlsx"`);
    res.send(buffer);
  } catch (err) { next(err); }
});

module.exports = router;
