import { Worker, type Job } from 'bullmq';
import { redisConnection } from './bullmq.js';
import { config } from '../config.js';
import { logger } from '../middleware/logger.js';
import { mediaRepo } from '../db/repositories/media.js';
import { planRepo } from '../db/repositories/plan.js';
import { jobRepo } from '../db/repositories/job.js';
import { projectRepo } from '../db/repositories/project.js';
import { renderRepo } from '../db/repositories/render.js';
import { validateEditPlan } from '@dictator/shared';
import { renderEditPlan, type ClipSegment } from '../rendering/ffmpeg.js';
import { uploadToS3 } from '../storage/s3.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Helper: update DB jobs table progress alongside BullMQ progress
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

    for (const id of mediaFileIds) {
      await mediaRepo.updateStatus(id, 'transcoding');
    }
    await updateJobProgress(job.data.dbJobId, 30, 'ingestion', job);

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
// ─────────────────────────────────────────────────────────────────────────────
export const aiWorker = new Worker(
  'ai',
  async (job: Job) => {
    const { projectId, mediaFileIds } = job.data as {
      projectId: string;
      mediaFileIds?: string[];
    };

    // ── analyze ───────────────────────────────────────────────────────────────
    if (job.name === 'analyze') {
      logger.info({ projectId }, '[ai] Starting analysis');
      await updateJobProgress(job.data.dbJobId, 10, 'shot_detection', job);

      const files = await mediaRepo.findByProject(projectId);
      const targetIds = mediaFileIds || files.map((f) => f.id);
      const localFilePaths: Record<string, string> = {};

      for (const f of files) {
        if (targetIds.includes(f.id)) {
          localFilePaths[f.id] = path.resolve(process.cwd(), f.originalFilename);
        }
      }

      const response = await fetch(`${config.AI_SERVICE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          media_file_ids: targetIds,
          local_file_paths: localFilePaths,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI /analyze failed (${response.status}): ${text}`);
      }

      const result = (await response.json()) as {
        shots: object[];
        transcript: object[];
        tags: Record<string, string[]>;
      };

      await updateJobProgress(job.data.dbJobId, 70, 'transcription', job);
      logger.info({ projectId, shots: result.shots.length }, '[ai] Analysis complete');
      await updateJobProgress(job.data.dbJobId, 100, 'enrichment', job);

      return result;
    }

    // ── generate-plan ─────────────────────────────────────────────────────────
    if (job.name === 'generate-plan') {
      logger.info({ projectId }, '[ai] Generating plan');
      await updateJobProgress(job.data.dbJobId, 10, 'planning', job);

      const childrenValues = await job.getChildrenValues();
      const analysisResult = Object.values(childrenValues)[0] as
        | {
            shots: object[];
            transcript: object[];
            tags: Record<string, string[]>;
          }
        | undefined;

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

      const { plan } = (await response.json()) as { plan: object };
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
// ─────────────────────────────────────────────────────────────────────────────
export const validationWorker = new Worker(
  'validation',
  async (job: Job) => {
    const { projectId } = job.data as { projectId: string };
    logger.info({ projectId }, '[validation] Starting');
    await updateJobProgress(job.data.dbJobId, 10, 'agent_validation', job);

    const childrenValues = await job.getChildrenValues();
    const plannerResult = Object.values(childrenValues)[0] as
      | { plan: any }
      | undefined;

    if (!plannerResult?.plan) {
      throw new Error('No plan found from generate-plan step');
    }

    await updateJobProgress(job.data.dbJobId, 40, 'system_validation', job);

    const result = validateEditPlan(plannerResult.plan);

    if (!result.valid) {
      const fatal = result.violations.filter((v) => v.severity === 'fatal');
      throw new Error(
        `Plan validation failed: ${result.fatal_count} fatal violation(s). First: ${fatal[0]?.message}`
      );
    }

    logger.info({ projectId, warnings: result.warning_count }, '[validation] Plan valid');

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

    await projectRepo.updateStatus(projectId, 'planned');
    await updateJobProgress(job.data.dbJobId, 100, 'agent_validation', job);

    logger.info({ projectId, revision: nextRev }, '[validation] Plan saved');
    return { projectId, valid: true, revision: nextRev };
  },
  { connection: redisConnection, concurrency: 4 }
);

// ─────────────────────────────────────────────────────────────────────────────
// WORKER 4: Render
// Uses FFmpeg to extract clip segments and concatenate into final video
// ─────────────────────────────────────────────────────────────────────────────
export const renderWorker = new Worker(
  'render',
  async (job: Job) => {
    const { projectId, renderType, planRevisionId, dbRenderJobId } = job.data as {
      projectId: string;
      renderType?: 'proxy' | 'final';
      planRevisionId?: string;
      dbRenderJobId?: string;
    };

    logger.info({ projectId, renderType, jobName: job.name }, '[render] Starting FFmpeg render');
    await updateJobProgress(job.data.dbJobId, 10, 'draft_render', job);

    // Fetch the plan revision to render
    const revisionRecord = planRevisionId
      ? await planRepo.findByRevision(projectId, Number(planRevisionId))
      : await planRepo.findLatest(projectId);

    if (!revisionRecord) {
      throw new Error(`No plan revision found to render for project ${projectId}`);
    }

    const planJson = revisionRecord.planJson as any;
    const timeline = planJson.timeline || [];
    const sourceShots = planJson.source_shots || [];
    const shotMap = new Map(sourceShots.map((s: any) => [s.shot_id, s]));

    const mediaFiles = await mediaRepo.findByProject(projectId);
    const mediaMap = new Map(mediaFiles.map((m) => [m.originalFilename, m]));

    // Construct clip segments for FFmpeg
    const segments: ClipSegment[] = [];
    for (const entry of timeline) {
      const shot = shotMap.get(entry.shot_id) as any;
      if (!shot) continue;

      // Find local file path
      const media = mediaMap.get(shot.source_file);
      const inputPath = path.resolve(process.cwd(), shot.source_file || media?.originalFilename || 'video.mp4');

      segments.push({
        inputPath,
        trimIn: entry.trim_in ?? shot.start,
        trimOut: entry.trim_out ?? shot.end,
        speed: entry.speed ?? 1.0,
        muteAudio: entry.source_audio === 'mute',
      });
    }

    if (segments.length === 0) {
      throw new Error('No timeline clips found to render');
    }

    const outputFilename = `render_${projectId}_rev${revisionRecord.revisionNumber}.mp4`;
    const outputPath = path.resolve(process.cwd(), outputFilename);
    const workDir = path.resolve(process.cwd(), `tmp_work_${projectId}`);

    logger.info({ projectId, segments: segments.length, outputPath }, '[render] Executing FFmpeg');
    await updateJobProgress(job.data.dbJobId, 30, 'draft_render', job);

    await renderEditPlan(segments, outputPath, workDir);

    await updateJobProgress(job.data.dbJobId, 80, 'draft_render', job);

    // Upload rendered video to S3
    const renderS3Key = `renders/${projectId}/${outputFilename}`;
    try {
      const buffer = await fs.readFile(outputPath);
      await uploadToS3(config.S3_BUCKET_RENDERS, renderS3Key, buffer, 'video/mp4');
      logger.info({ projectId, renderS3Key }, '[render] Uploaded rendered video to S3');
    } catch (s3Err) {
      logger.warn({ s3Err }, '[render] S3 upload failed, keeping local file');
    }

    if (dbRenderJobId) {
      await renderRepo.updateStatus(dbRenderJobId, 'completed', {
        s3OutputKey: renderS3Key,
        completedAt: new Date(),
      });
    }

    await projectRepo.updateStatus(projectId, 'completed');
    await updateJobProgress(job.data.dbJobId, 100, 'draft_render', job);

    logger.info({ projectId, outputPath, renderS3Key }, '[render] Render complete');
    return { projectId, rendered: true, outputPath, renderS3Key };
  },
  { connection: redisConnection, concurrency: 1 }
);

// Event listeners
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
  worker.on('error', (err) => logger.error({ queue: name, err }, 'Worker error'));
}
