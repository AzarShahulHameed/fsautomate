// src/middleware/planGuard.js
// ─────────────────────────────────────────────────────────────────────────────
// Enforces plan limits on resource creation.
// Called as middleware on POST /api/clients and POST /api/engagements.
// Returns 402 Payment Required when a firm exceeds their plan limits.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { prisma } = require('../config/db');

const PLAN_LIMITS = {
  starter:      { clients: 5,   users: 3,   engagements: 10  },
  professional: { clients: 25,  users: 10,  engagements: 100 },
  enterprise:   { clients: null, users: null, engagements: null }, // unlimited
  trial:        { clients: 3,   users: 2,   engagements: 5   },
};

// Get the effective plan, accounting for trial expiry
async function getEffectivePlan(firmId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT plan, "trialEndsAt", "planExpiresAt" FROM "Firm" WHERE id=$1 LIMIT 1`,
    firmId
  );
  if (!rows.length) return 'starter';
  const { plan, trialEndsAt, planExpiresAt } = rows[0];

  // If subscription expired, downgrade to starter
  if (planExpiresAt && new Date(planExpiresAt) < new Date() && plan !== 'enterprise') {
    return 'starter';
  }
  return plan || 'starter';
}

// Middleware: enforce client count limit
async function enforceClientLimit(req, res, next) {
  try {
    const plan   = await getEffectivePlan(req.firmId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
    if (limits.clients === null) return next(); // unlimited

    const count = await prisma.client.count({
      where: { firmId: req.firmId, isActive: true, deletedAt: null },
    });

    if (count >= limits.clients) {
      return res.status(402).json({
        error:      `Your ${plan} plan allows up to ${limits.clients} clients.`,
        plan,
        limit:      limits.clients,
        current:    count,
        upgradeUrl: '/settings?tab=billing',
      });
    }
    next();
  } catch (err) { next(err); }
}

// Middleware: enforce engagement count limit
async function enforceEngagementLimit(req, res, next) {
  try {
    const plan   = await getEffectivePlan(req.firmId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
    if (limits.engagements === null) return next(); // unlimited

    // Count all engagements across all firm clients
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM "Engagement" e
       JOIN "Client" c ON c.id = e."clientId"
       WHERE c."firmId" = $1 AND e."deletedAt" IS NULL`,
      req.firmId
    );
    const count = Number(rows[0]?.count || 0);

    if (count >= limits.engagements) {
      return res.status(402).json({
        error:      `Your ${plan} plan allows up to ${limits.engagements} engagements.`,
        plan,
        limit:      limits.engagements,
        current:    count,
        upgradeUrl: '/settings?tab=billing',
      });
    }
    next();
  } catch (err) { next(err); }
}

// Middleware: enforce user count limit
async function enforceUserLimit(req, res, next) {
  try {
    const plan   = await getEffectivePlan(req.firmId);
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;
    if (limits.users === null) return next(); // unlimited

    const count = await prisma.user.count({
      where: { firmId: req.firmId, isActive: true },
    });

    if (count >= limits.users) {
      return res.status(402).json({
        error:      `Your ${plan} plan allows up to ${limits.users} users.`,
        plan,
        limit:      limits.users,
        current:    count,
        upgradeUrl: '/settings?tab=billing',
      });
    }
    next();
  } catch (err) { next(err); }
}

// Helper: get plan info for a firm (used in billing UI)
async function getPlanInfo(firmId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT plan, "trialEndsAt", "planExpiresAt", "razorpaySubscriptionId"
     FROM "Firm" WHERE id=$1 LIMIT 1`,
    firmId
  );
  if (!rows.length) return { plan: 'starter', limits: PLAN_LIMITS.starter };
  const row  = rows[0];
  const plan = await getEffectivePlan(firmId);
  return {
    plan,
    storedPlan:     row.plan,
    trialEndsAt:    row.trialEndsAt,
    planExpiresAt:  row.planExpiresAt,
    hasSubscription: !!row.razorpaySubscriptionId,
    limits:         PLAN_LIMITS[plan] || PLAN_LIMITS.starter,
    allPlans:       PLAN_LIMITS,
  };
}

module.exports = {
  enforceClientLimit,
  enforceEngagementLimit,
  enforceUserLimit,
  getPlanInfo,
  PLAN_LIMITS,
};
