'use strict';
const router  = require('express').Router();
const { prisma } = require('../config/db');
const { authGuard } = require('../middleware/tenant');

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Simulate sending OTP (replace with actual email/SMS service)
async function sendOTP(type, target, otp, userName) {
  // In production: use Nodemailer for email, Twilio/MSG91 for SMS
  // For now: log to console (visible in Render logs)
  console.log(`\n========== OTP VERIFICATION ==========`);
  console.log(`Type:   ${type}`);
  console.log(`Target: ${target}`);
  console.log(`User:   ${userName}`);
  console.log(`OTP:    ${otp}`);
  console.log(`Valid:  10 minutes`);
  console.log(`======================================\n`);

  // TODO: Replace with actual sending
  // Email: nodemailer / SendGrid / Resend
  // SMS: Twilio / MSG91 / Fast2SMS (India) / Unifonic (UAE)
  return true;
}

// POST /api/otp/send — send OTP for email or phone verification
router.post('/send', authGuard, async (req, res, next) => {
  try {
    const { type, target } = req.body; // type: 'email' | 'phone'
    if (!type || !target) return res.status(400).json({ error: 'type and target required' });
    if (!['email','phone'].includes(type)) return res.status(400).json({ error: 'type must be email or phone' });

    // Rate limit: max 3 OTPs per hour per user per type
    const recent = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as cnt FROM "OTPVerification"
       WHERE "userId"=$1 AND type=$2 AND "createdAt" > NOW() - INTERVAL '1 hour'`,
      req.user.id, type
    );
    if (parseInt(recent[0].cnt) >= 3) {
      return res.status(429).json({ error: 'Too many OTP requests. Wait 1 hour before requesting again.' });
    }

    // Invalidate previous OTPs for same user+type+target
    await prisma.$executeRawUnsafe(
      `UPDATE "OTPVerification" SET verified=true WHERE "userId"=$1 AND type=$2 AND target=$3 AND verified=false`,
      req.user.id, type, target
    );

    const otp       = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.$executeRawUnsafe(
      `INSERT INTO "OTPVerification" ("userId",type,target,otp,"expiresAt") VALUES ($1,$2,$3,$4,$5)`,
      req.user.id, type, target, otp, expiresAt
    );

    // Send OTP via email or SMS
    if (type === 'email') {
      const html = otpEmailHTML(otp, `Please verify your email address.`, req.user.name, 10);
      await sendEmail({ to: target, subject: `${otp} is your FinStatement verification code`, html });
    } else {
      // SMS — log for now, wire Twilio/Fast2SMS here
      console.log(`[SMS OTP] Send ${otp} to ${target}`);
    }

    res.json({
      sent: true,
      message: type === 'email'
        ? `OTP sent to ${target.replace(/(.{2})(.*)(@.*)/, '$1***$3')}`
        : `OTP sent to ${target.slice(0,4)}****${target.slice(-3)}`,
      expiresIn: 600, // seconds
      // In development, return OTP so you can test without email/SMS setup
      ...(process.env.NODE_ENV !== 'production' ? { otp } : {}),
    });
  } catch (err) { next(err); }
});

// POST /api/otp/verify — verify OTP and update profile
router.post('/verify', authGuard, async (req, res, next) => {
  try {
    const { type, target, otp } = req.body;
    if (!type || !target || !otp) return res.status(400).json({ error: 'type, target and otp required' });

    // Find latest unverified OTP
    const records = await prisma.$queryRawUnsafe(
      `SELECT * FROM "OTPVerification"
       WHERE "userId"=$1 AND type=$2 AND target=$3 AND verified=false AND "expiresAt" > NOW()
       ORDER BY "createdAt" DESC LIMIT 1`,
      req.user.id, type, target
    );

    if (!records.length) {
      return res.status(400).json({ error: 'OTP expired or not found. Request a new one.' });
    }

    const record = records[0];

    // Max 5 attempts
    if (record.attempts >= 5) {
      return res.status(400).json({ error: 'Too many wrong attempts. Request a new OTP.' });
    }

    // Increment attempts
    await prisma.$executeRawUnsafe(
      `UPDATE "OTPVerification" SET attempts=attempts+1 WHERE id=$1`, record.id
    );

    if (record.otp !== otp.trim()) {
      const remaining = 4 - record.attempts;
      return res.status(400).json({
        error: `Wrong OTP. ${remaining} attempt${remaining!==1?'s':''} remaining.`
      });
    }

    // Mark as verified
    await prisma.$executeRawUnsafe(
      `UPDATE "OTPVerification" SET verified=true WHERE id=$1`, record.id
    );

    // Now actually update the user's email or phone
    if (type === 'email') {
      // Check email not taken
      const existing = await prisma.$queryRawUnsafe(
        `SELECT id FROM "User" WHERE email=$1 AND id!=$2 LIMIT 1`,
        target.toLowerCase(), req.user.id
      );
      if (existing.length) return res.status(409).json({ error: 'Email already in use by another account' });

      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET email=$1,"updatedAt"=NOW() WHERE id=$2`,
        target.toLowerCase(), req.user.id
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET phone=$1,"updatedAt"=NOW() WHERE id=$2`,
        target, req.user.id
      );
    }

    res.json({
      verified: true,
      message: type === 'email' ? 'Email verified and updated successfully' : 'Phone number verified and updated successfully',
      [type]: target,
    });
  } catch (err) { next(err); }
});

module.exports = router;
