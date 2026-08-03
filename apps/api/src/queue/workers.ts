import { Worker, type Job } from 'bullmq';
import { redisConnection } from './bullmq.js';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';
import { mediaRepo } from '../db/repositories/media.js';
import { planRepo } from '../db/repositories/plan.js';
import { jobRepo } from '../db/repositories/job.js';
import { projectRepo } from '../db/repositories/project.js';
import { validateEditPlan } from '@dictator/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: update our DB jobs table progress alongside BullMQ progress
// ─────────────────────────────────────────────────────────────────────────────
async function updateJobProgress(
  dbJobId: string | undefined,
  progress: number,
  stage: string,
  bullJob: Job
) {
  await bullJob.updateProgress(progress);
  if (dbJobId) await jobRepo.updateProgress(dbJobId, progress, stage);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER 1: Ingestion
// Marks media files as processing. FFmpeg transcoding will be added in Part D.
// ─────────────────────────────────────────────────────────────────────────────
export const ingestionWorker = new Worker(
  'ingestion',
  async (job: Job) => {
    const { projectId, mediaFileIds } = job.data as {
      projectId: string;
      mediaFileIds: string[];
    };

    logger.info({ projectId, mediaFileIds }, '[ingestion] Starting');
    await updateJobProgress(job.data.dbJobId, 5, 'ingestion', job);

    // Mark all media files as transcoding
    for (const id of mediaFileIds) {
      await mediaRepo.updateStatus(id, 'transcoding');
    }
    await updateJobProgress(job.data.dbJobId, 30, 'ingestion', job);

    // TODO (Part D): FFmpeg proxy + thumbnail generation per file
    // For now: mark as processed so the pipeline continues
    for (const id of mediaFileIds) {
      await mediaRepo.updateStatus(id, 'processed');
    }

    await updateJobProgress(job.data.dbJobId, 100, 'ingestion', job);
    logger.info({ projectId }, '[ingestion] Done');

    return { projectId, mediaFileIds };
  },
  { connection: redisConnection, concurrency: 2 }
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER 2: AI Service
// Handles two job names: "analyze" and "generate-plan"
// Both call the Python AI service at AI_SERVICE_URL
// ─────────────────────────────────────────────────────────────────────────────
export const aiWorker = new Worker(
  'ai',
  async (job: Job) => {
    const { projectId, mediaFileIds } = job.data as {
      projectId: string;
      mediaFileIds?: string[];
    };

    // ── analyze: shot detection + transcription + tagging ────────────────────
    if (job.name === 'analyze') {
      logger.info({ projectId }, '[ai] Starting analysis');
      await updateJobProgress(job.data.dbJobId, 10, 'shot_detection', job);

      const response = await fetch(`${config.AI_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, media_file_ids: mediaFileIds }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI /analyze failed (${response.status}): ${text}`);
      }

      const result = await response.json() as {
        shots: object[];
        transcript: object[];
        tags: Record<string, string[]>;
      };

      await updateJobProgress(job.data.dbJobId, 70, 'transcription', job);
      logger.info({ projectId, shots: result.shots.length }, '[ai] Analysis complete');
      await updateJobProgress(job.data.dbJobId, 100, 'enrichment', job);

      return result;
    }

    // ── generate-plan: LLM agent builds the Edit Plan ────────────────────────
    if (job.name === 'generate-plan') {
      logger.info({ projectId }, '[ai] Generating plan');
      await updateJobProgress(job.data.dbJobId, 10, 'planning', job);

      // The analysis result comes from the child job via BullMQ's return value
      const childrenValues = await job.getChildrenValues();
      const analysisResult = Object.values(childrenValues)[0] as {
        shots: object[];
        transcript: object[];
        tags: Record<string, string[]>;
      } | undefined;

      const response = await fetch(`${config.AI_SERVICE_URL}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          shots: analysisResult?.shots ?? [],
          transcript: analysisResult?.transcript ?? [],
          tags: analysisResult?.tags ?? {},
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI /plan failed (${response.status}): ${text}`);
      }

      const { plan } = await response.json() as { plan: object };
      await updateJobProgress(job.data.dbJobId, 100, 'planning', job);
      logger.info({ projectId }, '[ai] Plan generated');

      return { projectId, plan };
    }

    throw new Error(`Unknown AI job name: ${job.name}`);
  },
  { connection: redisConnection, concurrency: 1 }
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER 3: Validation
// Fetches the generated plan from child job output and runs validateEditPlan()
// Persists it to edit_plan_revisions if valid
// ─────────────────────────────────────────────────────────────────────────────
export const validationWorker = new Worker(
  'validation',
  async (job: Job) => {
    const { projectId } = job.data as { projectId: string };
    logger.info({ projectId }, '[validation] Starting');
    await updateJobProgress(job.data.dbJobId, 10, 'agent_validation', job);

    // Get the plan from the generate-plan child job
    const childrenValues = await job.getChildrenValues();
    const plannerResult = Object.values(childrenValues)[0] as
      | { plan: any }
      | undefined;

    if (!plannerResult?.plan) {
      throw new Error('No plan found from generate-plan step');
    }

    await updateJobProgress(job.data.dbJobId, 40, 'system_validation', job);

    // Run system-level structural validation
    const result = validateEditPlan(plannerResult.plan);

    if (!result.valid) {
      const fatal = result.violations.filter((v) => v.severity === 'fatal');
      throw new Error(
        `Plan validation failed: ${result.fatal_count} fatal violation(s). First: ${fatal[0]?.message}`
      );
    }

    logger.info({ projectId, warnings: result.warning_count }, '[validation] Plan valid');

    // Persist as revision 1 (agent-generated)
    const latest = await planRepo.findLatest(projectId);
    const nextRev = (latest?.revisionNumber ?? 0) + 1;

    await planRepo.create({
      projectId,
      revisionNumber: nextRev,
      parentRevision: latest?.revisionNumber ?? null,
      planJson: plannerResult.plan,
      source: 'agent',
      status: 'active',
    });

    // Update project status to "planned"
    await projectRepo.updateStatus(projectId, 'planned');
    await updateJobProgress(job.data.dbJobId, 100, 'agent_validation', job);

    logger.info({ projectId, revision: nextRev }, '[validation] Plan saved');
    return { projectId, valid: true, revision: nextRev };
  },
  { connection: redisConnection, concurrency: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER 4: Render
// Handles both "render-proxy" (auto) and "render-manual" (user-triggered)
// FFmpeg/Shotstack implementation goes in Part D
// ─────────────────────────────────────────────────────────────────────────────
export const renderWorker = new Worker(
  'render',
  async (job: Job) => {
    const { projectId, renderType } = job.data as {
      projectId: string;
      renderType?: 'proxy' | 'final';
      planRevisionId?: string;
    };

    logger.info({ projectId, renderType, jobName: job.name }, '[render] Starting');
    await updateJobProgress(job.data.dbJobId, 10, 'draft_render', job);

    // TODO (Part D): implement FFmpeg proxy render or Shotstack final render
    // For now: simulate render completion so the pipeline completes end-to-end
    await new Promise((resolve) => setTimeout(resolve, 500));

    await projectRepo.updateStatus(projectId, 'planned');
    await updateJobProgress(job.data.dbJobId, 100, 'draft_render', job);

    logger.info({ projectId }, '[render] Done (stub)');
    return { projectId, rendered: true, renderType };
  },
  { connection: redisConnection, concurrency: 1 }
);

// ─────────────────────────────────────────────────────────────────────────────
// Global worker error handlers
// ─────────────────────────────────────────────────────────────────────────────
for (const [name, worker] of Object.entries({
  ingestion: ingestionWorker,
  ai: aiWorker,
  validation: validationWorker,
  render: renderWorker,
})) {
  worker.on('completed', (job) =>
    logger.info({ queue: name, jobId: job.id, jobName: job.name }, 'Job completed')
  );
  worker.on('failed', (job, err) =>
    logger.error({ queue: name, jobId: job?.id, jobName: job?.name, err }, 'Job failed')
  );
  worker.on('error', (err) =>
    logger.error({ queue: name, err }, 'Worker error')
  );
}
