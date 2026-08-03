import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';

// ── Redis connection ──────────────────────────────────────────────────────────
// maxRetriesPerRequest: null is required by BullMQ
export const redisConnection = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => logger.info('Redis connected'));
redisConnection.on('error', (err) => logger.error({ err }, 'Redis error'));

// ── Queue definitions ─────────────────────────────────────────────────────────
// ingestion  — transcode raw uploads → proxy + thumbnail via FFmpeg
// ai         — call Python AI service: /analyze and /plan
// validation — run system-level validateEditPlan() before committing
// render     — trigger Shotstack or FFmpeg final render

export const ingestionQueue = new Queue('ingestion', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const aiQueue = new Queue('ai', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const validationQueue = new Queue('validation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export const renderQueue = new Queue('render', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 100 },
  },
});

// ── Queue events (optional: hook for logging/monitoring) ──────────────────────
export const ingestionEvents = new QueueEvents('ingestion', { connection: redisConnection });
export const aiEvents = new QueueEvents('ai', { connection: redisConnection });
export const renderEvents = new QueueEvents('render', { connection: redisConnection });
