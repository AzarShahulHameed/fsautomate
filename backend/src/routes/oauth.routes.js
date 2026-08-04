// src/routes/oauth.routes.js
'use strict';

const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { prisma } = require('../config/db');
const { setAuthCookie } = require('../utils/authCookie');
const { issueCsrfToken } = require('../utils/csrf');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JWT_SECRET   = process.env.JWT_SECRET;

// ── Helper: find or create user from OAuth profile ────────────────────────────
async function findOrCreateOAuthUser(email, name, avatar, provider) {
  email = email.toLowerCase().trim();

  // 1. Find existing user by email
  const existing = await prisma.$queryRawUnsafe(
    `SELECT u.*, f.name as "firmName", f.region as "firmRegion", f.currency as "firmCurrency",
            f.slug as "firmSlug", f.plan as "firmPlan"
     FROM "User" u JOIN "Firm" f ON f.id = u."firmId"
     WHERE u.email = $1 AND u."isActive" = true LIMIT 1`,
    email
  );

  if (existing.length) {
    const u = existing[0];
    // Update avatar if changed
    if (avatar && u.avatar !== avatar) {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET avatar=$1, "lastLoginAt"=$2 WHERE id=$3`,
        avatar, new Date(), u.id
      );
    }
    return {
      user: { id: u.id, email: u.email, name: u.name, role: u.role, avatar: avatar || u.avatar },
      firm: { id: u.firmId, name: u.firmName, region: u.firmRegion, currency: u.firmCurrency },
    };
  }

  // 2. New user — create firm + user automatically
  const firmSlug = email.split('@')[1].split('.')[0] + '-' + uuid().slice(0,6);
  const firmName = name + "'s Firm";

  const firm = await prisma.firm.create({
    data: {
      id: uuid(), name: firmName, slug: firmSlug,
      plan: 'STARTER', region: 'India', currency: 'INR', isActive: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      id: uuid(), firmId: firm.id, email, name,
      passwordHash: '', // no password for OAuth users
      role: 'FIRM_ADMIN', isActive: true,
      avatar: avatar || null,
    },
  });

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar },
    firm: { id: firm.id, name: firm.name, region: firm.region, currency: firm.currency },
    isNew: true,
  };
}

// ── Helper: create session and redirect to frontend ───────────────────────────
async function createSessionAndRedirect(res, userData) {
  const { user, firm } = userData;

  const token = jwt.sign({ userId: user.id, firmId: firm.id }, JWT_SECRET, { expiresIn: '8h' });
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: { id: uuid(), userId: user.id, token, expiresAt },
  });

  setAuthCookie(res, token);
  issueCsrfToken(res);

  // Previously: token (and email, name, avatar) went out in the redirect
  // URL query string. That's a leak on its own — URLs land in browser
  // history and server access logs. The cookie above carries auth now;
  // the frontend calls /api/auth/me after landing on /oauth-callback to
  // pick up the signed-in user, so nothing sensitive needs to ride in the URL.
  res.redirect(`${FRONTEND_URL}/oauth-callback`);
}

// ── GOOGLE OAuth ──────────────────────────────────────────────────────────────
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect(`${FRONTEND_URL}/login?error=Google+login+not+configured`);
  }

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL || 'https://fsautomate.onrender.com'}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${FRONTEND_URL}/login?error=Google+login+cancelled`);

    const backendURL = process.env.BACKEND_URL || 'https://fsautomate.onrender.com';

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  `${backendURL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token from Google');

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profile.email) throw new Error('No email from Google profile');

    const userData = await findOrCreateOAuthUser(profile.email, profile.name, profile.picture, 'google');
    await createSessionAndRedirect(res, userData);

  } catch (err) {
    console.error('[Google OAuth Error]', err.message);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Google login failed: ' + err.message)}`);
  }
});

// ── MICROSOFT OAuth ───────────────────────────────────────────────────────────
router.get('/microsoft', (req, res) => {
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return res.redirect(`${FRONTEND_URL}/login?error=Microsoft+login+not+configured`);
  }

  const params = new URLSearchParams({
    client_id:     process.env.MICROSOFT_CLIENT_ID,
    redirect_uri:  `${process.env.BACKEND_URL || 'https://fsautomate.onrender.com'}/api/auth/microsoft/callback`,
    response_type: 'code',
    scope:         'openid email profile User.Read',
    response_mode: 'query',
  });

  res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
});

router.get('/microsoft/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${FRONTEND_URL}/login?error=Microsoft+login+cancelled`);

    const backendURL = process.env.BACKEND_URL || 'https://fsautomate.onrender.com';

    // Exchange code for tokens
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        redirect_uri:  `${backendURL}/api/auth/microsoft/callback`,
        grant_type:    'authorization_code',
        scope:         'openid email profile User.Read',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error('No access token from Microsoft');

    // Get user profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    const email = profile.mail || profile.userPrincipalName;
    if (!email) throw new Error('No email from Microsoft profile');

    // Get profile photo (optional)
    let avatar = null;
    try {
      const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (photoRes.ok) {
        const blob = await photoRes.arrayBuffer();
        avatar = `data:image/jpeg;base64,${Buffer.from(blob).toString('base64')}`;
      }
    } catch { /* photo is optional */ }

    const userData = await findOrCreateOAuthUser(email, profile.displayName, avatar, 'microsoft');
    await createSessionAndRedirect(res, userData);

  } catch (err) {
    console.error('[Microsoft OAuth Error]', err.message);
    res.redirect(`${FRONTEND_URL}/login?error=${encodeURIComponent('Microsoft login failed: ' + err.message)}`);
  }
});

module.exports = router;
