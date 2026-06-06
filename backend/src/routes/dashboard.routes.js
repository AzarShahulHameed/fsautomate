// src/routes/dashboard.routes.js
'use strict';
const router = require('express').Router();
const { authGuard } = require('../middleware/tenant');
const { prisma }    = require('../config/db');

router.use(authGuard);

// GET /api/dashboard/summary — firm-wide snapshot for the dashboard
router.get('/summary', async (req, res, next) => {
  try {
    const firmId = req.firmId;

    // All in parallel
    const [
      clientCount,
      engagementsByStatus,
      recentAuditLogs,
      validationFailures,
      recentEngagements,
    ] = await Promise.all([
      // Total active clients
      prisma.client.count({ where: { firmId, isActive: true, deletedAt: null } }),

      // Engagement count grouped by status
      prisma.$queryRawUnsafe(`
        SELECT e.status, COUNT(*)::int as count
        FROM "Engagement" e
        JOIN "Client" c ON c.id = e."clientId"
        WHERE c."firmId" = $1 AND e."deletedAt" IS NULL
        GROUP BY e.status
      `, firmId),

      // Recent audit log entries (last 10 meaningful actions)
      prisma.auditLog.findMany({
        where:   { firmId, entityType: { not: null } },
        orderBy: { createdAt: 'desc' },
        take:    10,
        include: { user: { select: { name: true, avatar: true } } },
      }),

      // Count validation failures across all firm engagements
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count
        FROM "ValidationLog" vl
        JOIN "Engagement" e ON e.id = vl."engagementId"
        JOIN "Client" c ON c.id = e."clientId"
        WHERE c."firmId" = $1 AND vl.status = 'FAIL'
        AND vl."createdAt" > NOW() - INTERVAL '30 days'
      `, firmId),

      // 5 most recently updated engagements with client names
      prisma.$queryRawUnsafe(`
        SELECT e.id, e.name, e.method, e."financialYear", e.status,
               e."isLocked", e."updatedAt", e."createdAt",
               c.name as "clientName", c.region as "clientRegion"
        FROM "Engagement" e
        JOIN "Client" c ON c.id = e."clientId"
        WHERE c."firmId" = $1 AND e."deletedAt" IS NULL AND c."deletedAt" IS NULL
        ORDER BY e."updatedAt" DESC
        LIMIT 8
      `, firmId),
    ]);

    // Shape engagement status counts
    const statusMap = {};
    for (const row of engagementsByStatus) {
      statusMap[row.status] = row.count;
    }
    const totalEngagements = Object.values(statusMap).reduce((s, n) => s + n, 0);

    // Shape audit log into human-readable entries
    const activity = recentAuditLogs.map(log => ({
      id:          log.id,
      action:      humanizeAction(log.action, log.entityType),
      entityType:  log.entityType,
      entityId:    log.entityId,
      userName:    log.user?.name || 'System',
      userAvatar:  log.user?.avatar || null,
      at:          log.createdAt,
    }));

    res.json({
      clients: {
        total: clientCount,
      },
      engagements: {
        total:    totalEngagements,
        byStatus: statusMap,
        recent:   recentEngagements,
      },
      validation: {
        failures: Number(validationFailures[0]?.count || 0),
      },
      activity,
    });
  } catch (err) { next(err); }
});

function humanizeAction(action, entityType) {
  const entity = (entityType || '').replace(/([A-Z])/g, ' $1').trim();
  const map = {
    POST:   `Created ${entity}`,
    PUT:    `Updated ${entity}`,
    PATCH:  `Updated ${entity}`,
    DELETE: `Deleted ${entity}`,
    GET:    `Viewed ${entity}`,
  };
  return map[action] || `${action} ${entity}`;
}

module.exports = router;
