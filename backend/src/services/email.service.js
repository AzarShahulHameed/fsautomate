// src/services/email.service.js
// ─────────────────────────────────────────────────────────────────────────────
// Email delivery with priority fallback:
//   1. Resend (RESEND_API_KEY set)         — recommended for production
//   2. SMTP / nodemailer (SMTP_HOST set)   — Gmail, Zoho, SendGrid SMTP
//   3. Console log (dev fallback)          — no setup required
//
// Required env vars (set ONE of the two providers):
//   Resend:   RESEND_API_KEY, FROM_EMAIL
//   SMTP:     SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const FROM    = process.env.FROM_EMAIL || 'noreply@finstatement.app';
const APPNAME = 'FinStatement';
const BRAND   = 'linear-gradient(135deg,#4f46e5,#7c3aed)';

// ── Transporter (initialised once) ───────────────────────────────────────────
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require('nodemailer');
  _transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _transporter;
}

// ── Core send function ────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  // 1. Resend
  if (process.env.RESEND_API_KEY) {
    try {
      let Resend; try { Resend = require('resend').Resend; } catch { console.warn('[Email] npm install resend'); throw new Error('resend not installed'); }
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({ from: FROM, to, subject, html });
      console.log(`[Email] Sent via Resend to ${to} — id: ${result?.id}`);
      return { sent: true, provider: 'resend', id: result?.id };
    } catch (e) {
      console.error('[Email] Resend failed:', e.message);
      // Fall through to SMTP
    }
  }

  // 2. SMTP / nodemailer
  const transporter = getTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({ from: `${APPNAME} <${FROM}>`, to, subject, html });
      console.log(`[Email] Sent via SMTP to ${to} — messageId: ${info.messageId}`);
      return { sent: true, provider: 'smtp', messageId: info.messageId };
    } catch (e) {
      console.error('[Email] SMTP failed:', e.message);
    }
  }

  // 3. Console fallback (development)
  console.log(`\n===== EMAIL (no provider configured) =====`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`==========================================\n`);
  return { sent: false, provider: 'console' };
}

// ── Shared layout wrapper ─────────────────────────────────────────────────────
function layout(bodyHTML, footerNote = '') {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Calibri,Arial,sans-serif">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
  <div style="background:${BRAND};padding:28px 40px;text-align:center">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">${APPNAME}</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px">Professional Financial Reporting</p>
  </div>
  <div style="padding:36px 40px">
    ${bodyHTML}
  </div>
  ${footerNote ? `<div style="padding:16px 40px 28px;border-top:1px solid #f1f5f9;text-align:center"><p style="margin:0;color:#94a3b8;font-size:11px">${footerNote}</p></div>` : ''}
</div>
<p style="text-align:center;color:#cbd5e1;font-size:11px;margin:16px">${APPNAME} · Confidential</p>
</body></html>`;
}

function btn(text, url) {
  return `<div style="text-align:center;margin:28px 0">
    <a href="${url}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:-0.3px">${text}</a>
  </div>`;
}

// ── Template 1: OTP verification ──────────────────────────────────────────────
function otpEmailHTML(otp, purpose, userName, expiryMins = 10) {
  return layout(`
    <p style="margin:0 0 6px;color:#64748b;font-size:14px">Hi ${userName || 'there'},</p>
    <p style="margin:0 0 24px;color:#1e293b;font-size:15px">${purpose}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px">
      <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your verification code</p>
      <p style="margin:0;font-size:36px;font-weight:700;color:#4f46e5;letter-spacing:8px;font-family:monospace">${otp}</p>
      <p style="margin:12px 0 0;color:#94a3b8;font-size:12px">Expires in ${expiryMins} minutes</p>
    </div>
    <p style="margin:0;color:#64748b;font-size:13px">If you did not request this code, you can safely ignore this email.</p>
  `, 'Do not share this code with anyone.');
}

// ── Template 2: Password reset ────────────────────────────────────────────────
function passwordResetHTML(resetUrl, userName, expiryMins = 30) {
  return layout(`
    <p style="margin:0 0 6px;color:#64748b;font-size:14px">Hi ${userName || 'there'},</p>
    <p style="margin:0 0 8px;color:#1e293b;font-size:15px">We received a request to reset your ${APPNAME} password.</p>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px">Click the button below to set a new password. This link expires in <strong>${expiryMins} minutes</strong>.</p>
    ${btn('Reset Password', resetUrl)}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px">Or copy this link into your browser:</p>
    <p style="margin:0;color:#4f46e5;font-size:12px;word-break:break-all">${resetUrl}</p>
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0">
    <p style="margin:0;color:#94a3b8;font-size:12px">If you did not request a password reset, no action is needed. Your account is secure.</p>
  `, 'This link can only be used once and expires in 30 minutes.');
}

// ── Template 3: Invitation to join firm ───────────────────────────────────────
function inviteEmailHTML(inviteUrl, inviterName, firmName, role, expiryHours = 48) {
  return layout(`
    <p style="margin:0 0 20px;color:#1e293b;font-size:15px">
      <strong>${inviterName}</strong> has invited you to join <strong>${firmName}</strong> on ${APPNAME} as a <strong>${role}</strong>.
    </p>
    <p style="margin:0 0 24px;color:#64748b;font-size:13px">
      ${APPNAME} is a professional financial statement platform for CAs and finance teams. 
      Click the button below to accept the invitation and set up your account.
    </p>
    ${btn('Accept Invitation', inviteUrl)}
    <p style="margin:0 0 8px;color:#64748b;font-size:13px">Or copy this link:</p>
    <p style="margin:0;color:#4f46e5;font-size:12px;word-break:break-all">${inviteUrl}</p>
    <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0">
    <p style="margin:0;color:#94a3b8;font-size:12px">This invitation expires in ${expiryHours} hours. If you did not expect this email, you can ignore it.</p>
  `, `Invited by ${inviterName} · ${firmName}`);
}

// ── Template 4: Engagement status notification ────────────────────────────────
function statusNotificationHTML(engagementName, clientName, oldStatus, newStatus, changedBy, firmName) {
  const statusColor = { UNDER_REVIEW: '#f59e0b', LOCKED: '#10b981', FILED: '#8b5cf6' }[newStatus] || '#64748b';
  return layout(`
    <p style="margin:0 0 16px;color:#1e293b;font-size:15px">
      An engagement has been updated in <strong>${firmName}</strong>.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:0 0 20px">
      <p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">Engagement</p>
      <p style="margin:0 0 16px;color:#1e293b;font-size:16px;font-weight:600">${engagementName}</p>
      <p style="margin:0 0 4px;color:#64748b;font-size:12px">Client: <strong style="color:#1e293b">${clientName}</strong></p>
      <p style="margin:0;color:#64748b;font-size:12px">Status: <span style="color:${statusColor};font-weight:600">${newStatus.replace(/_/g,' ')}</span></p>
    </div>
    <p style="margin:0;color:#64748b;font-size:13px">Updated by <strong>${changedBy}</strong>.</p>
  `);
}

module.exports = {
  sendEmail,
  otpEmailHTML,
  passwordResetHTML,
  inviteEmailHTML,
  statusNotificationHTML,
};
