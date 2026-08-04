// src/config/redis.js
// ─────────────────────────────────────────────────────────────────────────────
// Single shared Redis client for the whole app: session store, rate limiting,
// login-attempt tracking, password reset tokens, invite tokens.
//
// Why this exists: the app previously kept all of the above in plain
// in-memory Maps. That only works with exactly one running server instance
// and loses everything on every restart/deploy. REDIS_URL was already in
// .env / .env.example and in package.json (redis, ioredis, connect-redis
// were installed) but never actually connected anywhere — this file closes
// that gap.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { createClient } = require('redis');

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  console.warn('[Redis] REDIS_URL not set — sessions, rate limiting, and token ' +
    'storage will fall back to in-memory storage. This is NOT safe for more ' +
    'than one server instance or for surviving restarts. Set REDIS_URL before ' +
    'deploying at scale.');
}

const redisClient = redisUrl
  ? createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    })
  : null;

if (redisClient) {
  redisClient.on('error', (err) => console.error('[Redis] Client error:', err.message));
  redisClient.on('connect', () => console.log('[Redis] Connected'));
  redisClient.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));

  // Connect eagerly at boot. server.js awaits this before listening.
  redisClient.connectPromise = redisClient.connect().catch((err) => {
    console.error('[Redis] Initial connection failed:', err.message);
  });
}

module.exports = { redisClient, redisEnabled: !!redisUrl };
