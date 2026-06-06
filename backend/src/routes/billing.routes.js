// src/routes/billing.routes.js
// ─────────────────────────────────────────────────────────────────────────────
// Razorpay integration for plan upgrades.
// Requires env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
// UAE firms can use Stripe instead — wire similarly using stripe npm package.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const router  = require('express').Router();
const crypto  = require('crypto');
const { authGuard, requireRole } = require('../middleware/tenant');
const { prisma }   = require('../config/db');
const { getPlanInfo, PLAN_LIMITS } = require('../middleware/planGuard');

// ── Razorpay helpers ──────────────────────────────────────────────────────────
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  let Razorpay; try { Razorpay = require('razorpay'); } catch { console.warn('[Billing] npm install razorpay'); return null; }
  return new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

// Plan pricing — amounts in paise (INR) or fils (AED)
const PLAN_PRICING = {
  professional: {
    INR: { amount: 299900, currency: 'INR', label: '₹2,999/month' },
    AED: { amount: 49900,  currency: 'AED', label: 'AED 499/month' },
  },
  enterprise: {
    INR: { amount: 999900, currency: 'INR', label: '₹9,999/month' },
    AED: { amount: 149900, currency: 'AED', label: 'AED 1,499/month' },
  },
};

router.use(authGuard);

// GET /api/billing/plan — get current plan info
router.get('/plan', async (req, res, next) => {
  try {
    const info = await getPlanInfo(req.firmId);

    // Get current usage counts
    const [clientCount, engCount, userCount] = await Promise.all([
      prisma.client.count({ where: { firmId: req.firmId, isActive: true, deletedAt: null } }),
      prisma.$queryRawUnsafe(`SELECT COUNT(*)::int as c FROM "Engagement" e JOIN "Client" cl ON cl.id=e."clientId" WHERE cl."firmId"=$1 AND e."deletedAt" IS NULL`, req.firmId).then(r=>Number(r[0]?.c||0)),
      prisma.user.count({ where: { firmId: req.firmId, isActive: true } }),
    ]);

    res.json({
      ...info,
      usage: { clients: clientCount, engagements: engCount, users: userCount },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || null,
    });
  } catch (err) { next(err); }
});

// POST /api/billing/create-order — create Razorpay order for plan upgrade
router.post('/create-order', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const { targetPlan } = req.body;
    if (!['professional','enterprise'].includes(targetPlan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const razorpay = getRazorpay();
    if (!razorpay) {
      // Dev mode — simulate success
      return res.json({
        devMode: true,
        message: 'Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET env vars.',
        orderId: `dev_order_${Date.now()}`,
      });
    }

    const firm     = await prisma.firm.findUnique({ where: { id: req.firmId } });
    const currency = firm?.currency || 'INR';
    const pricing  = PLAN_PRICING[targetPlan]?.[currency] || PLAN_PRICING[targetPlan]?.INR;

    const order = await razorpay.orders.create({
      amount:          pricing.amount,
      currency:        pricing.currency,
      receipt:         `plan_${req.firmId}_${Date.now()}`,
      notes:           { firmId: req.firmId, targetPlan, firmName: firm?.name || '' },
    });

    res.json({
      orderId:   order.id,
      amount:    pricing.amount,
      currency:  pricing.currency,
      label:     pricing.label,
      firmName:  firm?.name || '',
      userEmail: req.user.email,
      userName:  req.user.name,
    });
  } catch (err) { next(err); }
});

// POST /api/billing/verify-payment — verify Razorpay payment signature + upgrade plan
router.post('/verify-payment', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, targetPlan } = req.body;

    if (!process.env.RAZORPAY_KEY_SECRET) {
      // Dev mode — just upgrade
      await upgradePlan(req.firmId, targetPlan, null, null);
      return res.json({ success: true, plan: targetPlan, devMode: true });
    }

    // Verify HMAC signature
    const body     = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }

    await upgradePlan(req.firmId, targetPlan, razorpay_payment_id, null);
    res.json({ success: true, plan: targetPlan });
  } catch (err) { next(err); }
});

// POST /api/billing/webhook — Razorpay webhook (set in Razorpay dashboard)
// URL: https://fsautomate.onrender.com/api/billing/webhook
// No auth — verified via webhook signature
router.post('/webhook', async (req, res, next) => {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.json({ received: true });

    const sig      = req.headers['x-razorpay-signature'];
    const body     = JSON.stringify(req.body);
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
    if (sig !== expected) return res.status(400).json({ error: 'Invalid signature' });

    const event = req.body;
    if (event.event === 'payment.captured') {
      const notes = event.payload?.payment?.entity?.notes || {};
      if (notes.firmId && notes.targetPlan) {
        await upgradePlan(notes.firmId, notes.targetPlan, event.payload.payment.entity.id, null);
      }
    }
    if (event.event === 'subscription.charged') {
      const sub = event.payload?.subscription?.entity;
      if (sub?.notes?.firmId) {
        const expiresAt = new Date(sub.current_end * 1000);
        await upgradePlan(sub.notes.firmId, sub.notes.targetPlan, null, expiresAt);
      }
    }
    res.json({ received: true });
  } catch (err) { next(err); }
});

async function upgradePlan(firmId, plan, paymentId, expiresAt) {
  const expiry = expiresAt || new Date(Date.now() + 31 * 24 * 60 * 60 * 1000); // 31 days default
  await prisma.$executeRawUnsafe(
    `UPDATE "Firm" SET plan=$1, "planExpiresAt"=$2, "updatedAt"=NOW() WHERE id=$3`,
    plan, expiry, firmId
  );
  console.log(`[Billing] Firm ${firmId} upgraded to ${plan}${paymentId ? ` (payment: ${paymentId})` : ''}`);
}

// POST /api/billing/cancel — cancel subscription (downgrade to starter at period end)
router.post('/cancel', requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "razorpaySubscriptionId" FROM "Firm" WHERE id=$1 LIMIT 1`, req.firmId
    );
    const subId = rows[0]?.razorpaySubscriptionId;

    if (subId && process.env.RAZORPAY_KEY_SECRET) {
      const razorpay = getRazorpay();
      if (razorpay) await razorpay.subscriptions.cancel(subId, { cancel_at_cycle_end: 1 });
    }

    // Plan stays active until planExpiresAt — downgrade happens automatically via getEffectivePlan
    res.json({ cancelled: true, message: 'Your plan will downgrade to Starter at the end of the current billing period.' });
  } catch (err) { next(err); }
});

module.exports = router;
