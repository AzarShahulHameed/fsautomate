// src/routes/tb.routes.js
'use strict';

const router = require('express').Router();
const multer = require('multer');
const { authGuard, engagementGuard } = require('../middleware/tenant');
const tbController = require('../controllers/tb.controller');
const { getPreviousYearTB } = require('../services/tb.service');
const { prisma } = require('../config/db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = require('path').extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only Excel (.xlsx, .xls) and CSV files are accepted'));
  },
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

// GET /api/tb/:engagementId/previous-year
router.get('/:engagementId/previous-year', engagementGuard, async (req, res, next) => {
  try {
    const result = await getPreviousYearTB(req.params.engagementId, req.firmId);
    res.json(result || { found: false, message: 'No previous year engagement found for this client' });
  } catch (err) { next(err); }
});

// POST /api/tb/:engagementId/copy-prior-year — copy current-year TB from a previous engagement as prior year
router.post('/:engagementId/copy-prior-year', engagementGuard, async (req, res, next) => {
  try {
    const { sourceEngagementId, label } = req.body;

    const sourceTB = await prisma.tBVersion.findFirst({
      where: { engagementId: sourceEngagementId, isPriorYear: false },
      orderBy: { versionNumber: 'desc' },
      include: { rows: true },
    });
    if (!sourceTB) return res.status(404).json({ error: 'Source TB not found' });

    // Delete any existing PY version for this engagement
    const existingPY = await prisma.tBVersion.findMany({
      where: { engagementId: req.params.engagementId, isPriorYear: true },
    });
    for (const old of existingPY) {
      await prisma.tBVersionDiff.deleteMany({ where: { tbVersionId: old.id } });
      await prisma.tBRow.deleteMany({ where: { tbVersionId: old.id } });
      await prisma.tBVersion.delete({ where: { id: old.id } });
    }

    const { v4: uuid } = require('uuid');
    const newVersion = await prisma.tBVersion.create({
      data: {
        id: uuid(),
        engagementId: req.params.engagementId,
        versionNumber: 0,
        uploadedByRef: req.user?.id || req.user?.email,
        rowCount: sourceTB.rows.length,
        isPriorYear: true,
        label: label || `Prior Year — auto-copied`,
        uploadedAt: new Date(),
      },
    });

    if (sourceTB.rows.length > 0) {
      await prisma.tBRow.createMany({
        data: sourceTB.rows.map(r => ({
          id: uuid(),
          tbVersionId: newVersion.id,
          engagementId: req.params.engagementId,
          accountNumber: r.accountNumber,
          accountName: r.accountName,
          grouping: r.grouping,
          subGrouping: r.subGrouping,
          debit: r.debit,
          credit: r.credit,
          net: r.net,
          aje: r.aje,
          finalNet: r.finalNet,
        })),
      });
    }

    res.json({ success: true, version: newVersion, rowCount: sourceTB.rows.length });
  } catch (err) { next(err); }
});

module.exports = router;
