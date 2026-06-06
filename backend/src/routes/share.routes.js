// src/routes/share.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Client read-only portal via time-limited share links.
// No authentication required for the public view endpoint.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const { authGuard, engagementGuard } = require('../middleware/tenant');
const { prisma } = require('../config/db');

// POST /api/share/:engagementId — generate a share link (authenticated CA only)
router.post('/:engagementId', authGuard, engagementGuard, async (req, res, next) => {
  try {
    const { expiryDays = 7, label } = req.body;
    const days = Math.min(Math.max(1, Number(expiryDays)), 30); // 1–30 days

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await prisma.$executeRawUnsafe(
      `INSERT INTO "ShareLink" (id, "engagementId", token, "createdBy", "expiresAt", label)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
      req.params.engagementId, token, req.user.id, expiresAt, label || null
    );

    const frontendUrl = process.env.FRONTEND_URL || 'https://fsautomate.vercel.app';
    res.status(201).json({
      token,
      url:       `${frontendUrl}/view/${token}`,
      expiresAt,
      expiryDays: days,
      label:     label || null,
    });
  } catch (err) { next(err); }
});

// GET /api/share/:engagementId/links — list active share links for an engagement
router.get('/:engagementId/links', authGuard, engagementGuard, async (req, res, next) => {
  try {
    const links = await prisma.$queryRawUnsafe(
      `SELECT sl.*, u.name as "createdByName"
       FROM "ShareLink" sl
       LEFT JOIN "User" u ON u.id = sl."createdBy"
       WHERE sl."engagementId" = $1 AND sl."isActive" = true
       ORDER BY sl."createdAt" DESC`,
      req.params.engagementId
    );
    res.json(links);
  } catch (err) { next(err); }
});

// DELETE /api/share/links/:token — revoke a share link
router.delete('/links/:token', authGuard, async (req, res, next) => {
  try {
    // Verify the link belongs to an engagement in this firm
    const rows = await prisma.$queryRawUnsafe(
      `SELECT sl.id FROM "ShareLink" sl
       JOIN "Engagement" e ON e.id = sl."engagementId"
       JOIN "Client" c ON c.id = e."clientId"
       WHERE sl.token = $1 AND c."firmId" = $2 LIMIT 1`,
      req.params.token, req.firmId
    );
    if (!rows.length) return res.status(404).json({ error: 'Link not found' });

    await prisma.$executeRawUnsafe(
      `UPDATE "ShareLink" SET "isActive" = false WHERE token = $1`, req.params.token
    );
    res.json({ revoked: true });
  } catch (err) { next(err); }
});

// GET /api/public/view/:token — PUBLIC endpoint, no auth
// Returns financial statement data for the shared engagement
router.get('/public/:token', async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT sl.*, e.method, e."financialYear", e.name as "engagementName",
              c.name as "clientName", c.cin, c."tradeLicense", c.region as "clientRegion",
              f.name as "firmName"
       FROM "ShareLink" sl
       JOIN "Engagement" e ON e.id = sl."engagementId"
       JOIN "Client" c ON c.id = e."clientId"
       JOIN "Firm" f ON f.id = c."firmId"
       WHERE sl.token = $1 AND sl."isActive" = true AND sl."expiresAt" > NOW()
       LIMIT 1`,
      req.params.token
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'This link has expired or is no longer valid.' });
    }

    const link = rows[0];

    // Track view
    await prisma.$executeRawUnsafe(
      `UPDATE "ShareLink" SET "viewCount" = "viewCount" + 1, "lastViewedAt" = NOW() WHERE token = $1`,
      req.params.token
    );

    // Fetch financial data
    const [fsLines, noteGroups] = await Promise.all([
      prisma.fSLine.findMany({
        where:   { engagementId: link.engagementId, isPriorYear: false },
        orderBy: { displayOrder: 'asc' },
      }),
      prisma.noteGroup.findMany({
        where:   { engagementId: link.engagementId },
        orderBy: { noteNumber: 'asc' },
        include: { noteDetails: { orderBy: { displayOrder: 'asc' } } },
      }),
    ]);

    res.json({
      engagement: {
        id:             link.engagementId,
        name:           link.engagementName,
        method:         link.method,
        financialYear:  link.financialYear,
        clientName:     link.clientName,
        clientRegion:   link.clientRegion,
        cin:            link.cin,
        tradeLicense:   link.tradeLicense,
        firmName:       link.firmName,
      },
      fsLines,
      noteGroups,
      shareLink: {
        expiresAt:    link.expiresAt,
        label:        link.label,
        viewCount:    link.viewCount + 1,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
