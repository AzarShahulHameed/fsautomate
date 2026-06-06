// src/middleware/tenant.js
// MNC-level fixes:
//   1. engagementGuard: single query with firm join — no fallback retry
//   2. Rate limit key exposed on req.firmId for server.js to use
'use strict';
const jwt    = require('jsonwebtoken');
const { prisma } = require('../config/db');

const sql = (q, ...p) => prisma.$queryRawUnsafe(q, ...p);

async function authGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'Missing authorization header' });

    const token = authHeader.slice(7);
    try {
      jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const session = await prisma.userSession.findFirst({
      where:   { token, expiresAt: { gt: new Date() } },
      include: { user: { include: { firm: true } } },
    });
    if (!session) return res.status(401).json({ error: 'Session expired. Please log in again.' });

    req.user      = session.user;
    req.firmId    = session.user.firmId;
    req.sessionId = session.id;
    next();
  } catch (err) { next(err); }
}

async function engagementGuard(req, res, next) {
  try {
    const { engagementId } = req.params;
    if (!engagementId)
      return res.status(400).json({ error: 'engagementId param required' });

    // Single query — always scoped to the user's firm. No fallback retry.
    // If the engagement exists but belongs to a different firm, this returns nothing → 404.
    // This is intentional: cross-firm access returns 404, not 403,
    // to avoid leaking the existence of engagements in other firms.
    const rows = await sql(
      `SELECT e.id, e.name, e.method, e."financialYear", e.currency,
              e."isActive", e."isLocked", e."clientId",
              c."firmId" as "clientFirmId", c.name as "clientName",
              c.region as "clientRegion", c.country as "clientCountry",
              c."tradeLicense", c."vatNumber", c.cin, c.pan, c.gstin
       FROM "Engagement" e
       JOIN "Client" c ON c.id = e."clientId"
       WHERE e.id = $1 AND c."firmId" = $2
       LIMIT 1`,
      engagementId, req.firmId
    );

    if (!rows.length) return res.status(404).json({ error: 'Engagement not found' });
    const row = rows[0];

    if (row.isLocked && ['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      return res.status(403).json({ error: 'Engagement is locked.' });
    }

    // Populate req.engagement
    req.engagement = {
      id:            row.id,
      clientId:      row.clientId,
      name:          row.name,
      method:        row.method,
      financialYear: row.financialYear,
      currency:      row.currency,
      isActive:      row.isActive,
      isLocked:      row.isLocked,
      client: {
        id:           row.clientId,
        name:         row.clientName,
        firmId:       row.clientFirmId,
        region:       row.clientRegion || row.clientCountry || 'India',
        tradeLicense: row.tradeLicense,
        vatNumber:    row.vatNumber,
        cin:          row.cin,
        pan:          row.pan,
        gstin:        row.gstin,
      },
    };

    // Item 5: Engagement-level access enforcement for STAFF and VIEWER roles.
    // FIRM_ADMIN and MANAGER can access all engagements in their firm.
    // STAFF and VIEWER can only access engagements they are explicitly assigned to.
    if (['STAFF', 'VIEWER'].includes(req.user.role)) {
      const assigned = await prisma.$queryRawUnsafe(
        `SELECT id FROM "EngagementUser" WHERE "engagementId"=$1 AND "userId"=$2 LIMIT 1`,
        engagementId, req.user.id
      );
      if (!assigned.length) {
        return res.status(403).json({ error: 'You are not assigned to this engagement. Ask a manager to add you.' });
      }
    }

    next();
  } catch (err) { next(err); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    next();
  };
}

module.exports = { authGuard, engagementGuard, requireRole };
