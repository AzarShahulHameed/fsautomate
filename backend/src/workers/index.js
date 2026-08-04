// src/workers/index.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point for the background worker process. Deployed as a SEPARATE
// Render service (type: Background Worker) from the web service —
// same repo, same env vars (needs DATABASE_URL and REDIS_URL at minimum),
// start command: `npm run worker` (see package.json).
//
// Run locally with: npm run worker
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
const { Worker } = require('bullmq');
const { queueConnection, queueEnabled } = require('../config/queue');
const { prisma, disconnectDB } = require('../config/db');

if (!queueEnabled) {
  console.error('[Worker] REDIS_URL is not set — the worker has nothing to connect to. Exiting.');
  process.exit(1);
}

const { generateFS } = require('../services/fs.service');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);

const fsGenerationWorker = new Worker(
  'fs-generation',
  async (job) => {
    const { engagementId, firmId } = job.data;
    console.log(`[Worker] Processing fs-generation job ${job.id} — engagement ${engagementId}`);
    const result = await generateFS(engagementId, firmId);
    return result;
  },
  { connection: queueConnection, concurrency: CONCURRENCY }
);

fsGenerationWorker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed (engagement ${job.data.engagementId})`);
});

fsGenerationWorker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed (engagement ${job?.data?.engagementId}):`, err.message);
});

console.log(`[Worker] fs-generation worker started, concurrency=${CONCURRENCY}`);

process.on('SIGTERM', async () => {
  console.log('[Worker] SIGTERM received, shutting down gracefully...');
  await fsGenerationWorker.close();
  await disconnectDB();
  process.exit(0);
});
