'use strict';

// ── Email Service ─────────────────────────────────────────────────────────────
// Supports Resend (recommended), falls back to console log in dev

async function sendEmail({ to, subject, html }) {
  // ── Resend ────────────────────────────────────────────────────────────────
  if (process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from   = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const result = await resend.emails.send({ from, to, subject, html });
    console.log('[Email] Sent via Resend:', result?.id);
    return result;
  }

  // ── Console fallback (development) ───────────────────────────────────────
  console.log(`\n===== EMAIL (no provider configured) =====`);
  console.log(`To:      ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`==========================================\n`);
}

// ── OTP email template ────────────────────────────────────────────────────────
function otpEmailHTML(otp, purpose, userName, expiryMins = 10) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Calibri,Arial,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">FinStatement</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px">Professional Financial Reporting</p>
    </div>
    <!-- Body -->
    <div style="padding:40px">
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${userName || 'there'},</p>
      <p style="margin:0 0 24px;color:#1e293b;font-size:15px">${purpose}</p>
      <!-- OTP Box -->
      <div style="background:#f1f5f9;border-radius:12px;padding:28px;text-align:center;margin:0 0 24px">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Your verification code</p>
        <div style="font-size:42px;font-weight:800;letter-spacing:12px;color:#4f46e5;font-family:monospace">${otp}</div>
        <p style="margin:12px 0 0;color:#94a3b8;font-size:12px">Valid for ${expiryMins} minutes</p>
      </div>
      <p style="margin:0 0 8px;color:#94a3b8;font-size:12px">If you didn't request this, please ignore this email.</p>
      <p style="margin:0;color:#94a3b8;font-size:12px">Do not share this code with anyone.</p>
    </div>
    <!-- Footer -->
    <div style="padding:20px 40px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center">
      <p style="margin:0;color:#94a3b8;font-size:11px">FinStatement by CAT Consultants · azarudeen@cat-cons.com</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { sendEmail, otpEmailHTML };
