// src/routes/fs.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, engagementGuard } = require('../middleware/tenant');
const fsService = require('../services/fs.service');

router.use(authGuard);

router.post('/:engagementId/generate', engagementGuard, async (req, res, next) => {
  try {
    const result = await fsService.generateFS(req.params.engagementId, req.firmId);
    res.json(result);
  } catch (err) { next(err); }
});

router.get('/:engagementId', engagementGuard, async (req, res, next) => {
  try {
    const result = await fsService.getFS(req.params.engagementId, req.firmId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
