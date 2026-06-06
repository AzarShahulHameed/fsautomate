'use strict';
// ── Taxonomy Manager Routes ─────────────────────────────────────────────────
// Allows FIRM_ADMIN to manage MasterGrouping rows:
//   GET    /api/taxonomy              — list all rows (filtered by method)
//   POST   /api/taxonomy              — add a new row
//   PUT    /api/taxonomy/:id          — update a row
//   DELETE /api/taxonomy/:id          — deactivate a row (soft delete)
//   GET    /api/taxonomy/gaps         — unmapped groupNames from recent engagements
//   POST   /api/taxonomy/import       — bulk upsert from uploaded array

const router = require('express').Router();
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

// ── GET /api/taxonomy — list all master grouping rows ───────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { method, sheet, search } = req.query;
    const where = { isActive: true };

    if (method && method !== 'ALL') {
      where.OR = [
        { methodApplicability: method },
        { methodApplicability: 'ALL' },
      ];
    }
    if (sheet) where.sheet = sheet;
    if (search) {
      where.groupName = { contains: search, mode: 'insensitive' };
    }

    const rows = await prisma.masterGrouping.findMany({
      where,
      orderBy: [{ sheet: 'asc' }, { displayOrder: 'asc' }],
    });

    // Usage count — how many Mapping records reference each groupName
    const usageCounts = await prisma.$queryRawUnsafe(`
      SELECT "groupName", COUNT(*)::int as count
      FROM "Mapping"
      WHERE "firmId" = $1
      GROUP BY "groupName"
    `, req.firmId);

    const usageMap = new Map(usageCounts.map(r => [r.groupName, r.count]));
    const enriched = rows.map(r => ({ ...r, usageCount: usageMap.get(r.groupName) || 0 }));

    res.json({ rows: enriched, total: enriched.length });
  } catch (err) { next(err); }
});

// ── GET /api/taxonomy/gaps — groupNames used in mappings but not in master ──
router.get('/gaps', async (req, res, next) => {
  try {
    // Get all unique groupNames used by this firm in their mappings
    const mappingGroups = await prisma.mapping.findMany({
      where: {
        engagement: { client: { firmId: req.firmId } },
        deletedAt: null,
      },
      select: { groupName: true, engagementId: true },
      distinct: ['groupName'],
    });

    // Get all master groupNames
    const masterGroups = await prisma.masterGrouping.findMany({
      where: { isActive: true },
      select: { groupName: true, methodApplicability: true },
    });
    const masterSet = new Set(masterGroups.map(r => r.groupName.toLowerCase().trim()));

    // Find gaps
    const gaps = mappingGroups
      .filter(m => !masterSet.has(m.groupName.toLowerCase().trim()))
      .map(m => m.groupName);

    // Deduplicate
    const uniqueGaps = [...new Set(gaps)];

    // Enrich with which engagement they appeared in
    const enriched = await Promise.all(uniqueGaps.map(async (groupName) => {
      const mapping = await prisma.mapping.findFirst({
        where: {
          groupName,
          engagement: { client: { firmId: req.firmId } },
        },
        include: { engagement: { select: { name: true } } },
      });
      return {
        groupName,
        engagementName: mapping?.engagement?.name || '—',
      };
    }));

    res.json({ gaps: enriched, count: enriched.length });
  } catch (err) { next(err); }
});

// ── POST /api/taxonomy — add a new row ──────────────────────────────────────
router.post('/', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const {
      groupName, sheet, assetLiability, subGroupNo, subGroupName,
      noteGroupId, methodApplicability, currentNonCurrent, plCategory, isCashItem,
    } = req.body;

    if (!groupName || !sheet || !assetLiability || !subGroupNo) {
      return res.status(400).json({ error: 'groupName, sheet, assetLiability, subGroupNo are required' });
    }

    // Check for duplicate subGroupNo
    const existing = await prisma.masterGrouping.findUnique({ where: { subGroupNo } });
    if (existing) return res.status(409).json({ error: `subGroupNo "${subGroupNo}" already exists` });

    // Get max displayOrder
    const maxOrder = await prisma.masterGrouping.aggregate({ _max: { displayOrder: true } });
    const displayOrder = (maxOrder._max.displayOrder || 0) + 1;

    const row = await prisma.masterGrouping.create({
      data: {
        groupName: groupName.trim(),
        sheet,
        assetLiability,
        subGroupNo: subGroupNo.trim(),
        subGroupName: subGroupName?.trim() || groupName.trim(),
        noteGroupId: noteGroupId || null,
        methodApplicability: methodApplicability || 'ALL',
        isActive: true,
        displayOrder,
        currentNonCurrent: currentNonCurrent || null,
        plCategory: plCategory || null,
        isCashItem: isCashItem || false,
      },
    });

    res.status(201).json(row);
  } catch (err) { next(err); }
});

// ── PUT /api/taxonomy/:id — update a row ────────────────────────────────────
router.put('/:id', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const {
      groupName, sheet, assetLiability, subGroupName, noteGroupId,
      methodApplicability, currentNonCurrent, plCategory, isCashItem, displayOrder,
    } = req.body;

    const row = await prisma.masterGrouping.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Row not found' });

    const updated = await prisma.masterGrouping.update({
      where: { id: req.params.id },
      data: {
        groupName:          groupName?.trim()     ?? row.groupName,
        sheet:              sheet                 ?? row.sheet,
        assetLiability:     assetLiability        ?? row.assetLiability,
        subGroupName:       subGroupName?.trim()  ?? row.subGroupName,
        noteGroupId:        noteGroupId           ?? row.noteGroupId,
        methodApplicability: methodApplicability  ?? row.methodApplicability,
        currentNonCurrent:  currentNonCurrent     ?? row.currentNonCurrent,
        plCategory:         plCategory            ?? row.plCategory,
        isCashItem:         isCashItem            ?? row.isCashItem,
        displayOrder:       displayOrder          ?? row.displayOrder,
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ── DELETE /api/taxonomy/:id — deactivate (soft delete) ─────────────────────
router.delete('/:id', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const row = await prisma.masterGrouping.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Row not found' });

    // Soft delete — mark inactive, don't actually delete
    // Prevents FK issues with existing Mapping records
    await prisma.masterGrouping.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ deleted: true, id: req.params.id });
  } catch (err) { next(err); }
});

// ── POST /api/taxonomy/import — bulk upsert ─────────────────────────────────
router.post('/import', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }

    let created = 0, updated = 0, errors = [];
    const maxOrder = await prisma.masterGrouping.aggregate({ _max: { displayOrder: true } });
    let nextOrder = (maxOrder._max.displayOrder || 0) + 1;

    for (const r of rows) {
      try {
        const existing = await prisma.masterGrouping.findUnique({
          where: { subGroupNo: r.subGroupNo },
        });

        if (existing) {
          await prisma.masterGrouping.update({
            where: { subGroupNo: r.subGroupNo },
            data: {
              groupName:         r.groupName?.trim()       || existing.groupName,
              sheet:             r.sheet                   || existing.sheet,
              assetLiability:    r.assetLiability          || existing.assetLiability,
              subGroupName:      r.subGroupName?.trim()    || existing.subGroupName,
              noteGroupId:       r.noteGroupId             || existing.noteGroupId,
              methodApplicability: r.methodApplicability   || existing.methodApplicability,
              currentNonCurrent: r.currentNonCurrent       ?? existing.currentNonCurrent,
              plCategory:        r.plCategory              ?? existing.plCategory,
              isCashItem:        r.isCashItem              ?? existing.isCashItem,
              isActive:          true,
            },
          });
          updated++;
        } else {
          await prisma.masterGrouping.create({
            data: {
              groupName:         r.groupName.trim(),
              sheet:             r.sheet,
              assetLiability:    r.assetLiability,
              subGroupNo:        r.subGroupNo.trim(),
              subGroupName:      r.subGroupName?.trim() || r.groupName.trim(),
              noteGroupId:       r.noteGroupId || null,
              methodApplicability: r.methodApplicability || 'ALL',
              currentNonCurrent: r.currentNonCurrent || null,
              plCategory:        r.plCategory || null,
              isCashItem:        r.isCashItem || false,
              isActive:          true,
              displayOrder:      nextOrder++,
            },
          });
          created++;
        }
      } catch (rowErr) {
        errors.push({ subGroupNo: r.subGroupNo, error: rowErr.message });
      }
    }

    res.json({ created, updated, errors, total: rows.length });
  } catch (err) { next(err); }
});

module.exports = router;
