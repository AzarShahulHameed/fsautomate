'use strict';
const jwt    = require('jsonwebtoken');
const { prisma } = require('../config/db');

// Module-level raw SQL helper — available to all middleware functions
const sql  = (q, ...p) => prisma.$queryRawUnsafe(q, ...p);
const exec = (q, ...p) => prisma.$executeRawUnsafe(q, ...p);

async function authGuard(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing authorization header' });
    const token = authHeader.slice(7);
    try { jwt.verify(token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
    const session = await prisma.userSession.findFirst({
      where: { token, expiresAt: { gt: new Date() } },
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
    if (!engagementId) return res.status(400).json({ error: 'engagementId param required' });

    // Use raw SQL to avoid Prisma relation issues after db pull
    // First try exact firmId match
    let rows = await sql(
      `SELECT e.*, c."firmId" as "clientFirmId", c.id as "clientId", c.name as "clientName",
              c.region as "clientRegion", c.country as "clientCountry",
              c."tradeLicense", c."vatNumber", c.cin, c.pan, c.gstin
       FROM "Engagement" e
       JOIN "Client" c ON c.id = e."clientId"
       WHERE e.id = $1 AND c."firmId" = $2
       LIMIT 1`,
      engagementId, req.firmId
    );

    // If not found, try without firmId check (engagement might belong to same firm via different path)
    if (!rows.length) {
      rows = await sql(
        `SELECT e.*, c."firmId" as "clientFirmId", c.id as "clientId", c.name as "clientName",
                c.region as "clientRegion", c.country as "clientCountry",
                c."tradeLicense", c."vatNumber", c.cin, c.pan, c.gstin
         FROM "Engagement" e
         JOIN "Client" c ON c.id = e."clientId"
         WHERE e.id = $1
         LIMIT 1`,
        engagementId
      );
      // Verify the found engagement's firm matches user's firm
      if (rows.length && rows[0].clientFirmId !== req.firmId) {
        return res.status(403).json({ error: 'Access denied to this engagement' });
      }
    }

    if (!rows.length) return res.status(404).json({ error: 'Engagement not found' });
    const row = rows[0];

    if (row.isLocked && ['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      return res.status(403).json({ error: 'Engagement is locked.' });
    }

    req.engagement = {
      id: row.id, clientId: row.clientId, name: row.name,
      method: row.method, financialYear: row.financialYear,
      currency: row.currency, isActive: row.isActive, isLocked: row.isLocked,
      client: {
        id: row.clientId, name: row.clientName, firmId: row.clientFirmId,
        region: row.clientRegion || row.clientCountry || 'India',
        tradeLicense: row.tradeLicense, vatNumber: row.vatNumber,
        cin: row.cin, pan: row.pan, gstin: row.gstin,
      },
    };
    next();
  } catch (err) { next(err); }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    next();
  };
}

module.exports = { authGuard, engagementGuard, requireRole };
