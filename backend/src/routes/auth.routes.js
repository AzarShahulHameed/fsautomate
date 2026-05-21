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

module.exports = router;

// PATCH /api/auth/profile
router.patch('/profile', authGuard, async (req, res, next) => {
  try {
    const { name, phone, designation, avatar } = req.body;
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET name=$1, phone=$2, designation=$3, avatar=$4, "updatedAt"=$5 WHERE id=$6`,
      name || req.user.name, phone || null, designation || null, avatar || null, now, req.user.id
    );
    res.json({ message: 'Profile updated' });
  } catch (err) { next(err); }
});

// PATCH /api/auth/password
router.patch('/password', authGuard, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
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
