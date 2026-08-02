import { Hono } from 'hono';
import { jobRepo } from '../db/repositories/job.js';
import { PIPELINE_STAGES } from '@dictator/shared';

export const jobRoutes = new Hono();

// ── GET /jobs/:id ─────────────────────────────────────────────────────────────
jobRoutes.get('/:id', async (c) => {
  const job = await jobRepo.findById(c.req.param('id'));
  if (!job) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
  }

  const events = await jobRepo.getEvents(job.id);

  // Build stage breakdown based on current_stage
  const currentStageIndex = job.currentStage
    ? PIPELINE_STAGES.indexOf(job.currentStage as any)
    : -1;

  const stages = PIPELINE_STAGES.map((name, i) => {
    if (currentStageIndex === -1) return { name, status: 'pending' };
    if (i < currentStageIndex) return { name, status: 'completed' };
    if (i === currentStageIndex) return { name, status: job.status === 'failed' ? 'failed' : 'running', progress: job.progress };
    return { name, status: 'pending' };
  });

  return c.json({
    id: job.id,
    project_id: job.projectId,
    job_type: job.jobType,
    status: job.status,
    progress: job.progress,
    current_stage: job.currentStage ?? null,
    error_details: job.errorDetails ?? null,
    started_at: job.startedAt ?? null,
    completed_at: job.completedAt ?? null,
    created_at: job.createdAt,
    stages,
    events: events.map((e) => ({
      id: e.id,
      event_type: e.eventType,
      message: e.message,
      data: e.data,
      created_at: e.createdAt,
    })),
  });
});
