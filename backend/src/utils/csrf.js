// src/utils/csrf.js
// ─────────────────────────────────────────────────────────────────────────────
// Double-submit-cookie CSRF protection.
//
// Why this is needed now, specifically: moving the JWT out of localStorage
// into an httpOnly cookie fixed XSS-based token theft, but in production the
// cookie has to be `sameSite: 'none'` (frontend and backend are different
// origins — Vercel and Render). SameSite=None means the browser attaches the
// auth cookie to a request from ANY site, not just yours. Our CORS allowlist
// stops a malicious page's fetch()/XHR from reading the response (and blocks
// the preflight for JSON requests entirely), but it does NOT stop a plain
// auto-submitting HTML <form> POST from being sent with the cookie attached —
// form submissions don't go through CORS preflight the way fetch() does, and
// express.urlencoded() is already enabled, so a forged form post to e.g.
// PATCH /api/auth/password would otherwise be accepted as if the real user
// submitted it.
//
// The fix: a second cookie holding a random token, NOT httpOnly (frontend JS
// must be able to read it), issued alongside the auth cookie. Every mutating
// request must echo that token back in a custom header. A cross-site form
// can forge the cookie being *sent* (browsers do that automatically) but it
// cannot forge the header, because it cannot read the cookie's value —
// same-origin policy blocks that, regardless of SameSite. No shared secret
// or server-side token storage needed; the cookie and header just have to match.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const crypto = require('crypto');

const CSRF_COOKIE = 'fs_csrf';
const CSRF_HEADER = 'x-csrf-token';
const MAX_AGE_MS  = 8 * 60 * 60 * 1000; // matches the auth cookie's lifetime

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function csrfCookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false, // must be readable by frontend JS — that's the whole mechanism
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   MAX_AGE_MS,
    path:     '/',
  };
}

// Call alongside setAuthCookie() everywhere a session is established
// (login, accept-invite, OAuth callback) and on /auth/me so browsers that
// already had a session before this shipped pick up a token on next load.
function issueCsrfToken(res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
  return token;
}

function clearCsrfCookie(res) {
  const { maxAge, ...opts } = csrfCookieOptions();
  res.clearCookie(CSRF_COOKIE, opts);
}

// Constant-time-ish comparison isn't critical here (this isn't a secret
// being guessed, it's a token being echoed — timing attacks don't apply the
// way they do to password/HMAC comparison) but crypto.timingSafeEqual costs
// nothing and removes the question entirely.
function verifyCsrf(req) {
  if (!MUTATING_METHODS.has(req.method)) return true;

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken  = req.headers[CSRF_HEADER];
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
  } catch {
    return false;
  }
}

module.exports = { CSRF_COOKIE, CSRF_HEADER, issueCsrfToken, clearCsrfCookie, verifyCsrf, MUTATING_METHODS };
