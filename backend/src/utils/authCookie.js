// src/utils/authCookie.js
// ─────────────────────────────────────────────────────────────────────────────
// Centralizes the httpOnly auth cookie so login, accept-invite, and OAuth
// callbacks all set/clear it identically.
//
// Replaces returning the raw JWT in the JSON response body / URL query
// string, which the frontend was storing in localStorage — readable by any
// injected script (XSS = instant account takeover, no browser protection
// possible). An httpOnly cookie can't be read by JS at all; the browser
// just sends it automatically on same-site/cross-site (with proper
// SameSite/secure flags) requests.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const COOKIE_NAME = 'fs_token';
const MAX_AGE_MS  = 8 * 60 * 60 * 1000; // 8h — matches JWT_EXPIRES_IN / session TTL

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure:   isProd,                 // required for SameSite=None
    sameSite: isProd ? 'none' : 'lax', // cross-site (Vercel <-> Render) needs 'none' in prod
    maxAge:   MAX_AGE_MS,
    path:     '/',
  };
}

function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
}

// Reads the token from the cookie first (browser clients), falling back to
// a Bearer header (non-browser API clients, e.g. Postman, a future mobile
// app, server-to-server calls) — keeps the API usable outside a browser.
function readToken(req) {
  if (req.cookies?.[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie, readToken };
