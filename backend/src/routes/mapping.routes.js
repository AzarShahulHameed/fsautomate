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

// GET /api/mapping/master/download?method=AS  — download full FS Groupings list as CSV
router.get('/master/download', authGuard, async (req, res, next) => {
  try {
    const { method } = req.query;
    const rows = await mappingService.loadMasterGrouping(method);

    // Build CSV
    const header = ['Sub Group No', 'Sub Group Name', 'Group Name', 'Note Group ID', 'Method Applicability'];
    const escape = (v) => {
      const s = String(v == null ? '' : v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [
      header.join(','),
      ...rows.map(r => [r.subGroupNo, r.subGroupName, r.groupName, r.noteGroupId || '', r.methodApplicability || ''].map(escape).join(',')),
    ];
    const csv = lines.join("\n");

    const filename = method ? `FS-Groupings-${method}.csv` : 'FS-Groupings.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM prefix for Excel UTF-8 compatibility
  } catch (err) { next(err); }
});

// POST /api/mapping/:engagementId/copy-from/:sourceEngagementId
// Copies all saved mappings from a source engagement to this one.
// Skips sub-groupings that are already mapped in the target.
// Use case: new engagement for same client — copy prior year mappings as a starting point.
router.post('/:engagementId/copy-from/:sourceEngagementId', engagementGuard, async (req, res, next) => {
  try {
    const { engagementId, sourceEngagementId } = req.params;

    // Verify source engagement belongs to same firm
    const { prisma } = require('../config/db');
    const sourceRows = await prisma.$queryRawUnsafe(
      `SELECT e.id FROM "Engagement" e JOIN "Client" c ON c.id = e."clientId"
       WHERE e.id = $1 AND c."firmId" = $2 LIMIT 1`,
      sourceEngagementId, req.firmId
    );
    if (!sourceRows.length) {
      return res.status(404).json({ error: 'Source engagement not found or belongs to a different firm' });
    }

    // Get source mappings (only saved, non-deleted)
    const sourceMappings = await prisma.mapping.findMany({
      where: { engagementId: sourceEngagementId, isSaved: true, deletedAt: null },
    });

    if (!sourceMappings.length) {
      return res.json({ copied: 0, message: 'Source engagement has no saved mappings to copy' });
    }

    // Get already-mapped sub-groupings in target (to avoid overwriting)
    const existingMappings = await prisma.mapping.findMany({
      where: { engagementId, deletedAt: null },
      select: { subGrouping: true },
    });
    const existingKeys = new Set(existingMappings.map(m => m.subGrouping.trim().toUpperCase()));

    // Filter to only unmapped sub-groupings
    const toCreate = sourceMappings.filter(
      m => !existingKeys.has(m.subGrouping.trim().toUpperCase())
    );

    if (!toCreate.length) {
      return res.json({ copied: 0, message: 'All sub-groupings in source are already mapped in target' });
    }

    // Bulk create — strip id and engagementId, use target engagementId
    const { v4: uuid } = require('uuid');
    await prisma.mapping.createMany({
      data: toCreate.map(m => ({
        id:              uuid(),
        engagementId,
        subGrouping:     m.subGrouping,
        groupName:       m.groupName,
        subGroupName:    m.subGroupName,
        subGroupNo:      m.subGroupNo,
        noteGroupId:     m.noteGroupId,
        masterGroupingId: m.masterGroupingId,
        displayOrder:    m.displayOrder,
        isManual:        m.isManual,
        isSaved:         true,
      })),
      skipDuplicates: true,
    });

    res.json({
      copied:  toCreate.length,
      skipped: sourceMappings.length - toCreate.length,
      message: `Copied ${toCreate.length} mapping${toCreate.length !== 1 ? 's' : ''} from prior engagement`,
    });
  } catch (err) { next(err); }
});

// DELETE /api/mapping/:engagementId/row/:subGrouping — soft delete a mapping row
router.delete('/:engagementId/row/:subGrouping', engagementGuard, async (req, res, next) => {
  try {
    const { prisma } = require('../config/db');
    await prisma.mapping.updateMany({
      where: { engagementId: req.params.engagementId, subGrouping: req.params.subGrouping },
      data:  { deletedAt: new Date(), isSaved: false },
    });
    res.json({ deleted: true, recoverable: true });
  } catch (err) { next(err); }
});

module.exports = router;
