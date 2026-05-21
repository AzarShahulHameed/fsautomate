// src/middleware/audit.js
'use strict';
const { prisma } = require('../config/db');

async function auditMiddleware(req, res, next) {
  const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!MUTATING.includes(req.method) || !req.user) return next();

  res.on('finish', async () => {
    try {
      if (res.statusCode < 400) {
        await prisma.auditLog.create({
          data: {
            firmId:     req.user?.firmId || 'unknown',
            userId:     req.user?.id    || null,
            action:     `${req.method} ${req.path}`,
            entityType: req.path.split('/')[3] || 'unknown',
            entityId:   req.params?.engagementId || req.params?.id || null,
            ipAddress:  req.ip,
            userAgent:  req.headers['user-agent']?.slice(0, 200),
          },
        });
      }
    } catch (_) { /* never crash on audit */ }
  });
  next();
}

module.exports = { auditMiddleware };
