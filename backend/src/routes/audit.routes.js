// src/routes/audit.routes.js
'use strict';
const router = require('express').Router();
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma } = require('../config/db');

router.use(authGuard);

// GET /api/audit — paginated audit log for firm (FIRM_ADMIN only)
router.get('/', requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, entityType, userId, engagementId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      firmId: req.firmId,
      ...(entityType   ? { entityType }     : {}),
      ...(userId       ? { userId }          : {}),
      ...(engagementId ? { entityId: engagementId, entityType: 'Engagement' } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:    Number(limit),
        skip,
        include: {
          user: { select: { name: true, email: true, avatar: true, role: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs: logs.map(l => ({
        id:         l.id,
        action:     l.action,
        entityType: l.entityType,
        entityId:   l.entityId,
        ipAddress:  l.ipAddress,
        userAgent:  l.userAgent,
        createdAt:  l.createdAt,
        user: l.user ? {
          name:   l.user.name,
          email:  l.user.email,
          avatar: l.user.avatar,
          role:   l.user.role,
        } : null,
      })),
      pagination: {
        page:  Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
