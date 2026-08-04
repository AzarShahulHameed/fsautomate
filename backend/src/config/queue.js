// src/config/queue.js
// ─────────────────────────────────────────────────────────────────────────────
// BullMQ job queue for FS generation — the one operation db.js's own
// comments already flagged as the reason the connection pool needs
// headroom ("Without this, concurrent generateFS calls exhaust the pool
// and crash"). generateFS does a large amount of read/write work across TB
// rows, notes, and schedules in a single request; running it inline means
// every concurrent generate holds a DB connection (out of your still-small
// pool) for the entire computation, and the requesting browser tab is
// blocked waiting on it too.
//
// This moves that work onto a queue processed by a separate worker process
// (src/workers/index.js — run as a second Render service, "Background
// Worker" type, same repo, start command `npm run worker`). The web
// process enqueues a job and returns immediately; the frontend polls a
// status endpoint.
//
// BullMQ needs an ioredis connection specifically (not the node-redis v4
// client used for sessions/rate-limiting elsewhere) — ioredis was already
// in package.json, unused, same story as the other Redis packages.
//
// Local dev without Redis running: queueEnabled is false, and the route
// falls back to running generateFS inline exactly as it did before this
// change, so nothing breaks if you haven't set REDIS_URL yet.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const IORedis = require('ioredis');

const redisUrl = process.env.REDIS_URL;
const queueEnabled = !!redisUrl;

let fsGenerationQueue = null;
let connection = null;

if (queueEnabled) {
  connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
  });
  connection.on('error', (err) => console.error('[Queue] Redis connection error:', err.message));

  const { Queue } = require('bullmq');
  fsGenerationQueue = new Queue('fs-generation', { connection });
} else {
  console.warn('[Queue] REDIS_URL not set — FS generation will run inline in the ' +
    'request instead of on a background queue. Fine for local dev; set REDIS_URL ' +
    'and run `npm run worker` as a separate process before deploying at scale.');
}

module.exports = { fsGenerationQueue, queueEnabled, queueConnection: connection };
