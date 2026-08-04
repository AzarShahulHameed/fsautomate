
'use strict';
const router  = require('express').Router();
const { sendEmail, passwordResetHTML, inviteEmailHTML } = require('../services/email.service');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { prisma } = require('../config/db');
const { authGuard, requireRole } = require('../middleware/tenant');
const { setAuthCookie, clearAuthCookie, readToken } = require('../utils/authCookie');
const { issueCsrfToken, clearCsrfCookie } = require('../utils/csrf');
 
router.post('/register', async (req, res, next) => {
  try {
    const { firmName, firmSlug, email, password, name, phone, designation, avatar, region } = req.body;
    if (!firmName || !email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });
    const currency = region === 'UAE' ? 'AED' : 'INR';
    const slug = (firmSlug || firmName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')).slice(0,60);
    const passwordHash = await bcrypt.hash(password, 12);
    // Prevent slug collision: if slug already exists, generate a unique one
    const existingFirm = await prisma.firm.findUnique({ where: { slug } });
    const finalSlug = existingFirm
      ? slug + '-' + Date.now().toString(36).slice(-4) // append short unique suffix
      : slug;
 
    const firm = await prisma.firm.create({
      data: { name: firmName, slug: finalSlug, region: region || 'India', currency },
    });
    const user = await prisma.user.create({
      data: { firmId: firm.id, email, passwordHash, name, role: 'FIRM_ADMIN', avatar: avatar||null, phone: phone||null, designation: designation||null },
    });
    res.status(201).json({ message: 'Account created', userId: user.id, firmId: firm.id });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already registered.' });
    next(err);
  }
});
 
const { get: storeGet, set: storeSet, del: storeDel, incr: storeIncr, ttl: storeTtl } = require('../utils/tokenStore');

const MAX_ATTEMPTS  = 10;
const LOCKOUT_S     = 15 * 60; // 15 minutes, in seconds (Redis TTL is seconds)
 
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
 
    // Brute force check — counter lives in Redis (falls back to in-memory
    // in dev without REDIS_URL) so it survives restarts and works across
    // multiple server instances.
    const attemptKey = email.toLowerCase().trim();
    const attemptCount = (await storeGet('login-attempts', attemptKey)) || 0;
    if (attemptCount >= MAX_ATTEMPTS) {
      const remainingS = await storeTtl('login-attempts', attemptKey);
      const remaining  = Math.max(1, Math.ceil((remainingS > 0 ? remainingS : LOCKOUT_S) / 60));
      return res.status(429).json({ error: `Account temporarily locked due to too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.` });
    }
 
    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
      include: { firm: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      // Record failed attempt — increments a Redis counter with a 15min TTL
      // that resets the window on the first failure, matching the old logic.
      await storeIncr('login-attempts', attemptKey, LOCKOUT_S);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
 
    // Successful login — clear attempts
    await storeDel('login-attempts', attemptKey);
    const token = jwt.sign({ userId: user.id, firmId: user.firmId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await prisma.userSession.create({ data: { userId: user.id, token, expiresAt } });
    setAuthCookie(res, token); // httpOnly — not readable by JS, so not stored in localStorage anymore
    issueCsrfToken(res);       // readable cookie — frontend echoes this back in a header on writes
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar||null, phone: user.phone||null, designation: user.designation||null },
      firm: { id: user.firm.id, name: user.firm.name, slug: user.firm.slug, region: user.firm.region||'India', currency: user.firm.currency||'INR' },
    });
  } catch (err) { next(err); }
});
 
router.post('/logout', authGuard, async (req, res, next) => {
  try {
    const token = readToken(req);
    if (token) await prisma.userSession.deleteMany({ where: { token } });
    clearAuthCookie(res);
    clearCsrfCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) { next(err); }
});
 
router.get('/me', authGuard, (req, res) => {
  const u = req.user;
  // Reissue the CSRF cookie here too — covers browsers with a session that
  // predates this change and never got one from /login.
  issueCsrfToken(res);
  res.json({
    id: u.id, email: u.email, name: u.name, role: u.role,
    avatar: u.avatar||null, phone: u.phone||null, designation: u.designation||null,
    firm: { id: u.firm?.id, name: u.firm?.name, region: u.firm?.region||'India', currency: u.firm?.currency||'INR' },
  });
});
 
router.patch('/page-state', authGuard, async (req, res, next) => {
  try {
    await prisma.userSession.update({ where: { id: req.sessionId }, data: { pageState: req.body.pageState } });
    res.json({ saved: true });
  } catch (err) { next(err); }
});
 
router.get('/page-state', authGuard, async (req, res, next) => {
  try {
    const s = await prisma.userSession.findUnique({ where: { id: req.sessionId } });
    res.json({ pageState: s?.pageState || null });
  } catch (err) { next(err); }
});
 
// PATCH /api/auth/profile
router.patch('/profile', authGuard, async (req, res, next) => {
  try {
    const { name, phone, designation, avatar, email } = req.body;
    const now = new Date();
 
    const avatarVal = (avatar && avatar.trim().length > 0)
      ? avatar.trim()
      : req.user.avatar;
 
    // If email is changing, check it's not already taken by another user
    if (email && email !== req.user.email) {
      const existing = await prisma.$queryRawUnsafe(
        `SELECT id FROM "User" WHERE email=$1 AND id != $2 LIMIT 1`,
        email.toLowerCase().trim(), req.user.id
      );
      if (existing.length) return res.status(400).json({ error: 'Email already in use by another account' });
    }
 
    const emailVal = (email && email.trim().length > 0) ? email.toLowerCase().trim() : req.user.email;
 
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET name=$1, phone=$2, designation=$3, avatar=$4, email=$5, "updatedAt"=$6 WHERE id=$7`,
      name || req.user.name,
      phone !== undefined ? (phone || null) : req.user.phone,
      designation !== undefined ? (designation || null) : req.user.designation,
      avatarVal || null,
      emailVal,
      now, req.user.id
    );
    res.json({ message: 'Profile updated', avatar: avatarVal, email: emailVal });
  } catch (err) { next(err); }
});
 
// PATCH /api/auth/firm — update firm name and region
router.patch('/firm', authGuard, async (req, res, next) => {
  try {
    const { name, region } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Firm name is required' });
 
    const currency = (region === 'UAE') ? 'AED' : 'INR';
    const now = new Date();
 
    await prisma.$executeRawUnsafe(
      `UPDATE "Firm" SET name=$1, region=$2, currency=$3, "updatedAt"=$4 WHERE id=$5`,
      name.trim(), region || 'India', currency, now, req.user.firmId
    );
 
    const updated = await prisma.$queryRawUnsafe(
      `SELECT id, name, slug, region, currency FROM "Firm" WHERE id=$1 LIMIT 1`,
      req.user.firmId
    );
 
    res.json({ message: 'Firm updated', firm: updated[0] });
  } catch (err) { next(err); }
});
 
// PATCH /api/auth/password
router.patch('/password', authGuard, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
 
    const users = await prisma.$queryRawUnsafe(
      `SELECT "passwordHash" FROM "User" WHERE id=$1`, req.user.id
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(currentPassword, users[0].passwordHash);
    if (!valid) return res.status(400).json({ error: 'Incorrect current password' });
    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "passwordHash"=$1, "updatedAt"=$2 WHERE id=$3`,
      newHash, new Date(), req.user.id
    );
    res.json({ message: 'Password changed' });
  } catch (err) { next(err); }
});
 
// Reset tokens and pending invites are stored via tokenStore (Redis-backed,
// TTL-native) — see comment on MAX_ATTEMPTS above for why this replaced the
// old in-memory Maps.

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
 
    const user = await prisma.user.findFirst({
      where:   { email: email.toLowerCase().trim(), isActive: true },
      include: { firm: true },
    });
    // Always return success — never reveal whether email exists
    if (!user) return res.json({ sent: true });
 
    const { randomBytes } = require('crypto');
    const token   = randomBytes(32).toString('hex');
    const TTL_S   = 30 * 60; // 30 minutes
    await storeSet('reset-token', token, { userId: user.id, email: user.email }, TTL_S);
 
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await sendEmail({
      to:      user.email,
      subject: 'Reset your FinStatement password',
      html:    passwordResetHTML(`${frontendUrl}/reset-password?token=${token}`, user.name, 30),
    });
    res.json({ sent: true });
  } catch (err) { next(err); }
});
 
// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
 
    const record = await storeGet('reset-token', token);
    if (!record)
      return res.status(400).json({ error: 'Reset link expired or invalid. Request a new one.' });
 
    const bcrypt = require('bcryptjs');
    const hash   = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: record.userId }, data: { passwordHash: hash, updatedAt: new Date() } });
    await prisma.userSession.deleteMany({ where: { userId: record.userId } });
    await storeDel('reset-token', token);
    res.json({ reset: true });
  } catch (err) { next(err); }
});
 
// POST /api/auth/invite — send invite email
router.post('/invite', authGuard, requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { email, role = 'STAFF' } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!['MANAGER','STAFF','VIEWER'].includes(role))
      return res.status(400).json({ error: 'Role must be MANAGER, STAFF, or VIEWER' });
 
    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), firmId: req.firmId, isActive: true },
    });
    if (existing) return res.status(409).json({ error: 'This email is already a member of your firm' });
 
    const firm = await prisma.firm.findUnique({ where: { id: req.firmId } });
 
    const { randomBytes } = require('crypto');
    const token = randomBytes(32).toString('hex');
    const TTL_S = 48 * 60 * 60; // 48 hours
    await storeSet('invite-token', token, {
      firmId: req.firmId, firmSlug: firm.slug, firmName: firm.name,
      email: email.toLowerCase().trim(), role, inviterName: req.user.name,
    }, TTL_S);
 
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    await sendEmail({
      to:      email,
      subject: `You're invited to join ${firm.name} on FinStatement`,
      html:    inviteEmailHTML(`${frontendUrl}/accept-invite?token=${token}`, req.user.name, firm.name, role, 48),
    });
    res.json({ sent: true, email, role });
  } catch (err) { next(err); }
});
 
// GET /api/auth/invite/:token — validate before showing accept form
router.get('/invite/:token', async (req, res, next) => {
  try {
    const record = await storeGet('invite-token', req.params.token);
    if (!record)
      return res.status(400).json({ error: 'Invite link expired or invalid' });
    res.json({ valid: true, email: record.email, firmName: record.firmName, role: record.role });
  } catch (err) { next(err); }
});
 
// POST /api/auth/accept-invite — create account and join firm
router.post('/accept-invite', async (req, res, next) => {
  try {
    const { token, name, password } = req.body;
    if (!token || !name || !password) return res.status(400).json({ error: 'Token, name and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
 
    const record = await storeGet('invite-token', token);
    if (!record)
      return res.status(400).json({ error: 'Invite link expired. Ask for a new invitation.' });
 
    const existing = await prisma.user.findFirst({ where: { email: record.email, firmId: record.firmId } });
    if (existing) { await storeDel('invite-token', token); return res.status(409).json({ error: 'Account already exists in this firm' }); }
 
    const bcrypt = require('bcryptjs');
    const jwt    = require('jsonwebtoken');
    const { v4: uuid } = require('uuid');
 
    const user = await prisma.user.create({
      data: { firmId: record.firmId, email: record.email, passwordHash: await bcrypt.hash(password, 12), name: name.trim(), role: record.role, isActive: true },
      include: { firm: true },
    });
    await storeDel('invite-token', token);
 
    const jwtToken = jwt.sign({ userId: user.id, firmId: user.firmId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    await prisma.userSession.create({ data: { id: uuid(), userId: user.id, token: jwtToken, expiresAt: new Date(Date.now() + 8*60*60*1000) } });
    setAuthCookie(res, jwtToken);
    issueCsrfToken(res);
 
    res.status(201).json({
      user:  { id: user.id, name: user.name, email: user.email, role: user.role, firmId: user.firmId },
      firm:  { id: user.firm.id, name: user.firm.name, slug: user.firm.slug, region: user.firm.region, currency: user.firm.currency },
    });
  } catch (err) { next(err); }
});
 
// ── Firm user management ──────────────────────────────────────────────────────
 
// GET /api/auth/users — list all users in firm
router.get('/users', authGuard, requireRole('FIRM_ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where:   { firmId: req.firmId },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, email: true, role: true,
        isActive: true, avatar: true, designation: true,
        phone: true, lastLoginAt: true, createdAt: true,
      },
    });
    res.json(users);
  } catch (err) { next(err); }
});
 
// PATCH /api/auth/users/:id/role — change a user's role
router.patch('/users/:id/role', authGuard, requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['FIRM_ADMIN', 'MANAGER', 'STAFF', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${validRoles.join(', ')}` });
    }
    // Cannot change own role
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }
    // Verify user belongs to same firm
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, firmId: req.firmId },
    });
    if (!target) return res.status(404).json({ error: 'User not found in your firm' });
 
    await prisma.user.update({
      where: { id: req.params.id },
      data:  { role, updatedAt: new Date() },
    });
    res.json({ updated: true, role });
  } catch (err) { next(err); }
});
 
// PATCH /api/auth/users/:id/deactivate — deactivate/reactivate a user
router.patch('/users/:id/deactivate', authGuard, requireRole('FIRM_ADMIN'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }
    const target = await prisma.user.findFirst({
      where: { id: req.params.id, firmId: req.firmId },
    });
    if (!target) return res.status(404).json({ error: 'User not found in your firm' });
 
    const isActive = !target.isActive; // toggle
    await prisma.user.update({
      where: { id: req.params.id },
      data:  { isActive, updatedAt: new Date() },
    });
 
    // If deactivating, invalidate all sessions
    if (!isActive) {
      await prisma.userSession.deleteMany({ where: { userId: req.params.id } });
    }
 
    res.json({ updated: true, isActive });
  } catch (err) { next(err); }
});
 
// ── Session management ────────────────────────────────────────────────────────
 
// GET /api/auth/sessions — list all active sessions for current user
router.get('/sessions', authGuard, async (req, res, next) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where:   { userId: req.user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    // Mark current session
    const result = sessions.map(s => ({
      id:        s.id,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.token === readToken(req),
      userAgent: req.headers['user-agent']?.slice(0,150) || null,
      ipAddress: req.ip,
    }));
    res.json(result);
  } catch (err) { next(err); }
});
 
// DELETE /api/auth/sessions/:id — revoke a specific session
router.delete('/sessions/:id', authGuard, async (req, res, next) => {
  try {
    await prisma.userSession.deleteMany({
      where: { id: req.params.id, userId: req.user.id }, // only own sessions
    });
    res.json({ revoked: true });
  } catch (err) { next(err); }
});
 
// DELETE /api/auth/sessions — revoke all other sessions
router.delete('/sessions', authGuard, async (req, res, next) => {
  try {
    const currentToken = readToken(req);
    await prisma.userSession.deleteMany({
      where: { userId: req.user.id, token: { not: currentToken } },
    });
    res.json({ revoked: true });
  } catch (err) { next(err); }
});
 
module.exports = router;