// src/config/db.js
// ─────────────────────────────────────────────────────────────────────────────
// MNC-level DB configuration:
//   1. Neon pgbouncer connection pooling — prevents pool exhaustion on cold starts
//   2. Retry wrapper — handles Neon cold-start transient failures transparently
//   3. Graceful shutdown — closes pool on SIGTERM before process exits
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { PrismaClient } = require('@prisma/client');

// ── Neon-optimised connection string ─────────────────────────────────────────
// connection_limit is now driven by DB_CONNECTION_LIMIT so it can be raised
// once you're off the Neon free tier, without a code change.
//
// How to size it: Neon plan's max connections ÷ number of running server
// instances, minus headroom for migrations/admin queries. Free tier should
// stay conservative (3-5) or you'll see pool-exhaustion errors under
// concurrent load (e.g. multiple generateFS calls at once). Set this
// explicitly in your environment — the default below is a safe floor for
// free-tier, NOT a production value for 1000 users.
function buildDatabaseUrl() {
  const base = process.env.DATABASE_URL;
  if (!base) return base;

  // Only modify Neon URLs (contains neon.tech) — leave local/other DBs untouched
  if (!base.includes('neon.tech')) return base;

  const connectionLimit = process.env.DB_CONNECTION_LIMIT || '3';

  // Neon pgbouncer endpoint: replace -pooler if missing, add params
  // Neon provides two URLs: direct (neon.tech) and pooler (-pooler.neon.tech)
  // We use the pooler endpoint when available via DIRECT_URL for migrations
  try {
    const url = new URL(base);
    if (!url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer',       'true');
      url.searchParams.set('connection_limit', connectionLimit);
      url.searchParams.set('connect_timeout',  '10');
    } else if (process.env.DB_CONNECTION_LIMIT) {
      url.searchParams.set('connection_limit', connectionLimit);
    }
    return url.toString();
  } catch {
    return base; // malformed URL — return as-is, let Prisma error naturally
  }
}

const prisma = new PrismaClient({
  datasourceUrl: buildDatabaseUrl(),
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// ── Retry wrapper for Neon cold-start transient failures ──────────────────────
// Neon serverless Postgres goes cold after ~5min inactivity.
// First connection attempt can fail with P1001 (can't reach DB) or P1017 (closed).
// This wrapper retries up to 3 times with exponential backoff.
const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const MAX_RETRIES     = 3;

async function withRetry(fn, attempt = 1) {
  try {
    return await fn();
  } catch (err) {
    const isRetryable = RETRYABLE_CODES.has(err?.code) ||
      err?.message?.includes('connection') ||
      err?.message?.includes('ECONNREFUSED') ||
      err?.message?.includes('timeout');

    if (isRetryable && attempt < MAX_RETRIES) {
      const delay = attempt * 500; // 500ms, 1000ms
      console.warn(`[DB] Transient error (${err?.code || err?.message?.slice(0, 40)}), retry ${attempt}/${MAX_RETRIES - 1} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return withRetry(fn, attempt + 1);
    }
    throw err;
  }
}

// ── Wrap Prisma with retry on every call ─────────────────────────────────────
// We use a Proxy so every prisma.modelName.method() call goes through withRetry
// without having to wrap each call site individually.
const prismaWithRetry = new Proxy(prisma, {
  get(target, prop) {
    const value = target[prop];
    // Only proxy model delegates (objects with find/create/update etc.)
    // Skip internal Prisma methods ($connect, $disconnect, $transaction, etc.)
    if (typeof prop === 'string' && typeof value === 'object' && value !== null && !prop.startsWith('$') && !prop.startsWith('_')) {
      return new Proxy(value, {
        get(modelTarget, method) {
          const fn = modelTarget[method];
          if (typeof fn === 'function') {
            return (...args) => withRetry(() => fn.apply(modelTarget, args));
          }
          return fn;
        },
      });
    }
    return value;
  },
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function disconnectDB() {
  try {
    await prisma.$disconnect();
    console.log('[DB] Disconnected cleanly');
  } catch (e) {
    console.error('[DB] Disconnect error:', e.message);
  }
}

module.exports = { prisma: prismaWithRetry, disconnectDB };
