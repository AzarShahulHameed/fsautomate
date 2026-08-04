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
const logger = require('../config/logger');

if (!queueEnabled) {
  logger.error('[Worker] REDIS_URL is not set — the worker has nothing to connect to. Exiting.');
  process.exit(1);
}

const { generateFS } = require('../services/fs.service');

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 3);

const fsGenerationWorker = new Worker(
  'fs-generation',
  async (job) => {
    const { engagementId, firmId } = job.data;
    logger.info('[Worker] Processing fs-generation job', { jobId: job.id, engagementId });
    const result = await generateFS(engagementId, firmId);
    return result;
  },
  { connection: queueConnection, concurrency: CONCURRENCY }
);

fsGenerationWorker.on('completed', (job) => {
  logger.info('[Worker] Job completed', { jobId: job.id, engagementId: job.data.engagementId });
});

fsGenerationWorker.on('failed', (job, err) => {
  logger.error('[Worker] Job failed', { jobId: job?.id, engagementId: job?.data?.engagementId, error: err.message });
});

logger.info(`[Worker] fs-generation worker started`, { concurrency: CONCURRENCY });

process.on('SIGTERM', async () => {
  logger.info('[Worker] SIGTERM received, shutting down gracefully...');
  await fsGenerationWorker.close();
  await disconnectDB();
  process.exit(0);
});
