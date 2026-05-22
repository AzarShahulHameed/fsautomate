// src/controllers/tb.controller.js
'use strict';

const tbService = require('../services/tb.service');
const mappingService = require('../services/mapping.service');

exports.upload = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { engagementId } = req.params;
    const isPriorYear = req.body.isPriorYear === 'true' || req.body.isPriorYear === true;
    const label       = req.body.label || null;

    const version = await tbService.uploadTB(
      engagementId,
      req.firmId,
      req.file.buffer,
      req.user.email,
      isPriorYear,
      label
    );

    // Auto-trigger mapping based on method
    const method = req.engagement.method;
    let mappingResult;
    if (method === 'AS' || method === 'IND_AS') {
      mappingResult = await mappingService.autoMapFromMaster(engagementId, method);
    } else {
      mappingResult = await mappingService.autoMapIFRS(engagementId);
    }

    res.status(201).json({
      version: {
        id: version.id,
        versionNumber: version.versionNumber,
        rowCount: version.rowCount,
        uploadedAt: version.uploadedAt,
      },
      mapping: mappingResult,
      message: `TB uploaded. Version ${version.versionNumber} created. ${mappingResult.mapped} items auto-mapped, ${mappingResult.unmapped.length} need manual mapping.`,
    });
  } catch (err) {
    next(err);
  }
};

exports.getLatest = async (req, res, next) => {
  try {
    const latest = await tbService.getLatestTBRows(req.params.engagementId, req.firmId);
    if (!latest) return res.status(404).json({ error: 'No TB uploaded yet' });
    res.json(latest);
  } catch (err) { next(err); }
};

exports.getVersions = async (req, res, next) => {
  try {
    const versions = await tbService.getVersionHistory(req.params.engagementId, req.firmId);
    res.json(versions);
  } catch (err) { next(err); }
};

exports.getDiff = async (req, res, next) => {
  try {
    const { prisma } = require('../config/db');
    // Use raw SQL to cast action enum to text (avoids Prisma enum mismatch)
    const diffs = await prisma.$queryRawUnsafe(
      `SELECT id, "tbVersionId", "accountNumber", "accountName",
              action::text as action, "oldFinalNet", "newFinalNet", "fieldChanged", "createdAt"
       FROM "TBVersionDiff"
       WHERE "tbVersionId" = $1
       ORDER BY action ASC, "accountNumber" ASC`,
      req.params.versionId
    );
    res.json(diffs);
  } catch (err) { next(err); }
};
