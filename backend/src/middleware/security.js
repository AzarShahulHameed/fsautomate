'use strict';

// ── Sanitize input — strip HTML/script tags from all string inputs ─────────────
function sanitizeInput(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      // Remove script tags, HTML tags, null bytes
      obj[key] = obj[key]
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\0/g, '')
        .trim();
    } else if (typeof obj[key] === 'object') {
      obj[key] = sanitizeInput(obj[key]);
    }
  }
  return obj;
}

// ── Input sanitization middleware ─────────────────────────────────────────────
function sanitizeMiddleware(req, res, next) {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query);
  next();
}

// ── Request size limit check ───────────────────────────────────────────────────
function sizeLimitCheck(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 50 * 1024 * 1024) { // 50MB max
    return res.status(413).json({ error: 'Request too large' });
  }
  next();
}

// ── Prevent parameter pollution ────────────────────────────────────────────────
function preventParamPollution(req, res, next) {
  // If a parameter is sent multiple times, use only the last value
  for (const key of Object.keys(req.query)) {
    if (Array.isArray(req.query[key])) {
      req.query[key] = req.query[key][req.query[key].length - 1];
    }
  }
  next();
}

module.exports = { sanitizeMiddleware, sizeLimitCheck, preventParamPollution };
