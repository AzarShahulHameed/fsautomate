// src/utils/tokenStore.js
// ─────────────────────────────────────────────────────────────────────────────
// Namespaced, TTL-aware key/value store. Backed by Redis when REDIS_URL is
// set (required for multi-instance / production); falls back to an
// in-memory Map for local dev without Redis running.
//
// Replaces the old pattern of ad-hoc `new Map()` + `setTimeout` cleanup used
// for login attempts, password reset tokens, and pending invites — those
// don't survive a restart and don't work across more than one instance.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { redisClient, redisEnabled } = require('../config/redis');

// Fallback in-memory store (dev only) — same TTL semantics as Redis so
// calling code doesn't need to know which backend is active.
const memoryStore = new Map(); // key -> { value, expiresAt }

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlSeconds) {
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

function memoryDelete(key) {
  memoryStore.delete(key);
}

function memoryIncr(key, ttlSeconds) {
  const current = memoryGet(key) || 0;
  const next = Number(current) + 1;
  memorySet(key, next, ttlSeconds);
  return next;
}

// ── Public API — always JSON-serializes values so callers can store objects ──
async function get(namespace, key) {
  const fullKey = `${namespace}:${key}`;
  if (redisEnabled && redisClient) {
    const raw = await redisClient.get(fullKey);
    return raw ? JSON.parse(raw) : null;
  }
  return memoryGet(fullKey);
}

async function set(namespace, key, value, ttlSeconds) {
  const fullKey = `${namespace}:${key}`;
  if (redisEnabled && redisClient) {
    const raw = JSON.stringify(value);
    if (ttlSeconds) await redisClient.set(fullKey, raw, { EX: ttlSeconds });
    else await redisClient.set(fullKey, raw);
    return;
  }
  memorySet(fullKey, value, ttlSeconds);
}

async function del(namespace, key) {
  const fullKey = `${namespace}:${key}`;
  if (redisEnabled && redisClient) {
    await redisClient.del(fullKey);
    return;
  }
  memoryDelete(fullKey);
}

// Atomic increment with TTL — used for login-attempt counters.
// Returns the new count.
async function incr(namespace, key, ttlSeconds) {
  const fullKey = `${namespace}:${key}`;
  if (redisEnabled && redisClient) {
    const count = await redisClient.incr(fullKey);
    if (count === 1 && ttlSeconds) await redisClient.expire(fullKey, ttlSeconds);
    return count;
  }
  return memoryIncr(fullKey, ttlSeconds);
}

async function ttl(namespace, key) {
  const fullKey = `${namespace}:${key}`;
  if (redisEnabled && redisClient) {
    return redisClient.ttl(fullKey); // seconds remaining, -2 if missing, -1 if no TTL
  }
  const entry = memoryStore.get(fullKey);
  if (!entry || !entry.expiresAt) return entry ? -1 : -2;
  return Math.max(0, Math.round((entry.expiresAt - Date.now()) / 1000));
}

module.exports = { get, set, del, incr, ttl };
