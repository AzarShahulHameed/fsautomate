'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { prisma } = require('../config/db');
const { authGuard } = require('../middleware/tenant');

router.post('/register', async (req, res, next) => {
  try {
    const { firmName, firmSlug, email, password, name, phone, designation, avatar, region } = req.body;
    if (!firmName || !email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });
    const currency = region === 'UAE' ? 'AED' : 'INR';
    const slug = (firmSlug || firmName.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'')).slice(0,60);
    const passwordHash = await bcrypt.hash(password, 12);
    const firm = await prisma.firm.upsert({
      where: { slug },
      update: {},
      create: { name: firmName, slug, region: region||'India', currency },
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

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { firm: true },
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ userId: user.id, firmId: user.firmId }, process.env.JWT_SECRET, { expiresIn: '8h' });
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await prisma.userSession.create({ data: { userId: user.id, token, expiresAt } });
    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar||null, phone: user.phone||null, designation: user.designation||null },
      firm: { id: user.firm.id, name: user.firm.name, slug: user.firm.slug, region: user.firm.region||'India', currency: user.firm.currency||'INR' },
    });
  } catch (err) { next(err); }
});

router.post('/logout', authGuard, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.slice(7);
    if (token) await prisma.userSession.deleteMany({ where: { token } });
    res.json({ message: 'Logged out' });
  } catch (err) { next(err); }
});

router.get('/me', authGuard, (req, res) => {
  const u = req.user;
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

// POST /api/auth/forgot-password — send reset OTP to email
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const users = await prisma.$queryRawUnsafe(
      `SELECT id, name, email FROM "User" WHERE LOWER(email)=$1 AND "isActive"=true LIMIT 1`,
      email.toLowerCase().trim()
    );

    // Always return success — don't reveal if email exists (security)
    if (!users.length) {
      return res.json({ sent: true, message: 'If that email exists, a reset code has been sent.' });
    }

    const user = users[0];
    const otp  = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store OTP
    await prisma.$executeRawUnsafe(
      `INSERT INTO "OTPVerification" ("userId", type, target, otp, "expiresAt")
       VALUES ($1, 'email', $2, $3, $4)`,
      user.id, email.toLowerCase().trim(), otp, expiresAt
    );

    // Log OTP (replace with email service in production)
    console.log(`
===== PASSWORD RESET OTP =====`);
    console.log(`Email: ${email}`);
    console.log(`OTP:   ${otp}`);
    console.log(`Valid: 15 minutes`);
    console.log(`==============================
`);

    res.json({
      sent: true,
      message: 'Reset code sent to your email.',
      ...(process.env.NODE_ENV !== 'production' ? { otp } : {}),
    });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password — verify OTP and set new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'Email, OTP and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const users = await prisma.$queryRawUnsafe(
      `SELECT id FROM "User" WHERE LOWER(email)=$1 AND "isActive"=true LIMIT 1`,
      email.toLowerCase().trim()
    );
    if (!users.length) return res.status(400).json({ error: 'Invalid email' });

    const userId = users[0].id;

    // Find valid OTP
    const records = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OTPVerification"
       WHERE "userId"=$1 AND type='email' AND target=$2 AND verified=false AND "expiresAt" > NOW()
       ORDER BY "createdAt" DESC LIMIT 1`,
      userId, email.toLowerCase().trim()
    );
    if (!records.length) return res.status(400).json({ error: 'OTP expired or invalid. Request a new one.' });

    const record = records[0];
    if (parseInt(record.attempts) >= 5) return res.status(400).json({ error: 'Too many wrong attempts. Request a new OTP.' });

    await prisma.$executeRawUnsafe(`UPDATE "OTPVerification" SET attempts=attempts+1 WHERE id=$1`, record.id);

    if (record.otp !== otp.trim()) {
      const left = 4 - parseInt(record.attempts);
      return res.status(400).json({ error: `Wrong OTP. ${left} attempt${left !== 1 ? 's' : ''} remaining.` });
    }

    // Mark verified and update password
    await prisma.$executeRawUnsafe(`UPDATE "OTPVerification" SET verified=true WHERE id=$1`, record.id);

    const bcrypt = require('bcryptjs');
    const hash   = await bcrypt.hash(newPassword, 12);
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "passwordHash"=$1, "updatedAt"=NOW() WHERE id=$2`,
      hash, userId
    );

    // Invalidate all sessions (force re-login everywhere)
    await prisma.userSession.deleteMany({ where: { userId } });

    res.json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) { next(err); }
});

module.exports = router;

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
