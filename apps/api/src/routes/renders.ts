import { Hono } from 'hono';
import { z } from 'zod';
import { renderRepo } from '../db/repositories/render.js';
import { planRepo } from '../db/repositories/plan.js';
import { projectRepo } from '../db/repositories/project.js';
import { renderQueue } from '../queue/bullmq.js';
import { logger } from '../middleware/logger.js';

export const renderRoutes = new Hono();

const renderRequestSchema = z.object({
  type: z.enum(['proxy', 'final']).default('proxy'),
  plan_revision: z.number().int().positive().optional(),
});

// /projects/:id/render
renderRoutes.post('/:id/render', async (c) => {
  const projectId = c.req.param('id');

  const project = await projectRepo.findById(projectId);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const parsed = renderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid render request', details: parsed.error.issues } },
      400
    );
  }

  // Resolve revision
  const plan = parsed.data.plan_revision
    ? await planRepo.findByRevision(projectId, parsed.data.plan_revision)
    : await planRepo.findLatest(projectId);

  if (!plan) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'No edit plan found. Create a plan first.' } }, 404);
  }

  const renderJob = await renderRepo.create({
    projectId,
    planRevisionId: plan.id,
    renderType: parsed.data.type,
    status: 'queued',
  });

  logger.info({ projectId, renderId: renderJob.id, type: parsed.data.type }, 'Render queued in DB');

  // Enqueue BullMQ render job
  await renderQueue.add('render-manual', {
    projectId,
    renderType: parsed.data.type,
    planRevisionId: plan.revisionNumber,
    dbRenderJobId: renderJob.id,
  });

  return c.json(
    { render_id: renderJob.id, status: renderJob.status, render_type: renderJob.renderType },
    202
  );
});

// /projects/:id/renders/:renderId
renderRoutes.get('/:id/renders/:renderId', async (c) => {
  const renderJob = await renderRepo.findById(c.req.param('renderId'));

  if (!renderJob || renderJob.projectId !== c.req.param('id')) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Render job not found' } }, 404);
  }

  return c.json({
    render_id: renderJob.id,
    status: renderJob.status,
    render_type: renderJob.renderType,
    s3_output_key: renderJob.s3OutputKey ?? null,
    started_at: renderJob.startedAt,
    completed_at: renderJob.completedAt,
    created_at: renderJob.createdAt,
  });
});
