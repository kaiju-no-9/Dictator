import { Hono } from 'hono';
import { planRepo } from '../db/repositories/plan.js';
import { projectRepo } from '../db/repositories/project.js';
import { editPlanSchema, validateEditPlan } from '@dictator/shared';
import { logger } from '../middleware/logger.js';

export const planRoutes = new Hono();

// ── GET /projects/:id/plan?revision=N ─────────────────────────────────────────
planRoutes.get('/:id/plan', async (c) => {
  const projectId = c.req.param('id');
  const revisionParam = c.req.query('revision');

  const plan = revisionParam
    ? await planRepo.findByRevision(projectId, parseInt(revisionParam, 10))
    : await planRepo.findLatest(projectId);

  if (!plan) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'No edit plan found for this project' } }, 404);
  }

  return c.json(plan);
});

// ── PUT /projects/:id/plan ─────────────────────────────────────────────────────
planRoutes.put('/:id/plan', async (c) => {
  const projectId = c.req.param('id');

  const project = await projectRepo.findById(projectId);
  if (!project) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
  }

  const body = await c.req.json();

  // Step 1: Zod schema parse
  const schemaParsed = editPlanSchema.safeParse(body);
  if (!schemaParsed.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Edit plan schema validation failed',
          details: schemaParsed.error.issues,
        },
      },
      400
    );
  }

  // Step 2: Structural / business rule validation (V-001..V-016)
  const validationResult = validateEditPlan(schemaParsed.data as any);
  if (!validationResult.valid) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_FAILED',
          message: `Edit plan has ${validationResult.fatal_count} fatal violation(s)`,
          details: validationResult.violations,
        },
      },
      422
    );
  }

  // Step 3: Persist as new revision
  const latest = await planRepo.findLatest(projectId);
  const nextRevision = (latest?.revisionNumber ?? 0) + 1;

  const revision = await planRepo.create({
    projectId,
    revisionNumber: nextRevision,
    parentRevision: latest?.revisionNumber ?? null,
    planJson: schemaParsed.data,
    source: 'human',
    status: 'active',
  });

  logger.info({ projectId, revision: nextRevision }, 'Plan revision saved');
  return c.json({ revision: revision.revisionNumber, status: revision.status }, 200);
});

// ── GET /projects/:id/plan/revisions ──────────────────────────────────────────
planRoutes.get('/:id/plan/revisions', async (c) => {
  const revisions = await planRepo.listRevisions(c.req.param('id'));
  return c.json(
    revisions.map((r) => ({
      revision: r.revisionNumber,
      source: r.source,
      status: r.status,
      created_at: r.createdAt,
    }))
  );
});
