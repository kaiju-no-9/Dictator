import { Hono } from 'hono';
import { z } from 'zod';
import { projectRepo } from '../db/repositories/project.js';
import { mediaRepo } from '../db/repositories/media.js';
import { planRepo } from '../db/repositories/plan.js';
import { logger } from '../middleware/logger.js';
import { pipelineService } from '../services/pipeline.js';

export const projectRoutes = new Hono();

// ── Request schemas
const createProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

// ── POST /projects ─────────────────────────────────────────────────────────────
projectRoutes.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      400
    );
  }

  const project = await projectRepo.create(parsed.data);
  logger.info({ projectId: project.id }, 'Project created');
  return c.json(project, 201);
});

// ── GET /projects ──────────────────────────────────────────────────────────────
projectRoutes.get('/', async (c) => {
  const projects = await projectRepo.list();
  return c.json(projects);
});

// ── GET /projects/:id ──────────────────────────────────────────────────────────
projectRoutes.get('/:id', async (c) => {
  const project = await projectRepo.findById(c.req.param('id'));
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const mediaFiles = await mediaRepo.findByProject(project.id);
  const latestPlan = await planRepo.findLatest(project.id);

  return c.json({
    ...project,
    media_files: mediaFiles,
    current_plan_revision: latestPlan?.revisionNumber ?? null,
  });
});

// ── POST /projects/:id/process ─────────────────────────────────────────────────
projectRoutes.post('/:id/process', async (c) => {
  const project = await projectRepo.findById(c.req.param('id'));
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const force = c.req.query('force') === 'true';

  if (project.status === 'processing' && !force) {
    return c.json(
      { error: { code: 'CONFLICT', message: 'Pipeline is already running for this project. Pass ?force=true to restart.' } },
      409
    );
  }

  // Reset status to allow re-processing
  await projectRepo.updateStatus(project.id, 'uploading');

  const job = await pipelineService.start(project.id);
  logger.info({ projectId: project.id, jobId: job.id }, 'Pipeline started');

  return c.json({ job_id: job.id, status: 'queued', project_id: project.id }, 202);
});
