// src/routes/tb.routes.js
'use strict';

const router = require('express').Router();
const multer = require('multer');
const { authGuard, engagementGuard } = require('../middleware/tenant');
const tbController = require('../controllers/tb.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel', 'text/csv'];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel and CSV files are accepted'));
    }
  },
});

router.use(authGuard);

// POST /api/tb/:engagementId/upload
router.post('/:engagementId/upload', engagementGuard, upload.single('file'), tbController.upload);

// GET /api/tb/:engagementId/latest
router.get('/:engagementId/latest', engagementGuard, tbController.getLatest);

// GET /api/tb/:engagementId/versions
router.get('/:engagementId/versions', engagementGuard, tbController.getVersions);

// GET /api/tb/:engagementId/versions/:versionId/diff
router.get('/:engagementId/versions/:versionId/diff', engagementGuard, tbController.getDiff);

module.exports = router;
