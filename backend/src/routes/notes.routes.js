// src/routes/notes.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const notesService = require('../services/notes.service');

router.use(authGuard);

// POST /api/notes/:engagementId/generate
router.post('/:engagementId/generate', engagementGuard, async (req, res, next) => {
  try {
    const result = await notesService.generateNotes(req.params.engagementId, req.firmId);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/notes/:engagementId
router.get('/:engagementId', engagementGuard, async (req, res, next) => {
  try {
    const notes = await notesService.getNotes(req.params.engagementId, req.firmId);
    res.json(notes);
  } catch (err) { next(err); }
});

module.exports = router;
