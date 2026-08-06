import { Hono } from 'hono';
import { z } from 'zod';
import { projectRepo } from '../db/repositories/project.js';
import { planRepo } from '../db/repositories/plan.js';
import { chatRepo } from '../db/repositories/chat.js';
import { config } from '../config.js';
import { validateEditPlan } from '@dictator/shared';
import { logger } from '../middleware/logger.js';

export const chatRoutes = new Hono();

const chatRequestSchema = z.object({
  message: z.string().min(1).max(2000),
});

// GET /projects/:id/chat — fetch full conversation history
chatRoutes.get('/:id/chat', async (c) => {
  const project = await projectRepo.findById(c.req.param('id'));
  if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);

  const messages = await chatRepo.findByProject(project.id);
  return c.json(messages);
});

// POST /projects/:id/chat — send a new editing instruction
chatRoutes.post('/:id/chat', async (c) => {
  const projectId = c.req.param('id');

  const project = await projectRepo.findById(projectId);
  if (!project) return c.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);

  const body = await c.req.json();
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } }, 400);
  }

  // Must have an existing plan to edit
  const currentPlan = await planRepo.findLatest(projectId);
  if (!currentPlan) {
    return c.json({
      error: { code: 'NO_PLAN', message: 'No edit plan exists yet. Run the pipeline first.' }
    }, 409);
  }

  // Load recent conversation history for context (last 20 messages)
  const history = await chatRepo.findRecent(projectId, 20);

  // Save the user message first
  await chatRepo.create({
    projectId,
    role: 'user',
    content: parsed.data.message,
  });

  // Call Python AI service /chat
  let aiResult: {
    reply: string;
    plan: Record<string, unknown>;
    changes: string[];
  };

  try {
    const response = await fetch(`${config.AI_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        current_plan: currentPlan.planJson,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        message: parsed.data.message,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI /chat failed (${response.status}): ${text}`);
    }

    aiResult = await response.json();
  } catch (err) {
    logger.error({ err, projectId }, 'Chat AI call failed');
    return c.json({ error: { code: 'AI_ERROR', message: 'AI service failed to process your request' } }, 502);
  }

  // Validate the returned plan
  const validation = validateEditPlan(aiResult.plan as any);
  if (!validation.valid) {
    logger.warn({ projectId, violations: validation.violations }, 'Chat returned invalid plan');
    return c.json({
      error: {
        code: 'INVALID_PLAN',
        message: 'The AI produced an invalid edit plan. Please try rephrasing.',
        violations: validation.violations.filter((v) => v.severity === 'fatal'),
      }
    }, 422);
  }

  // Save as new plan revision
  const nextRevision = (currentPlan.revisionNumber ?? 0) + 1;
  const newRevision = await planRepo.create({
    projectId,
    revisionNumber: nextRevision,
    parentRevision: currentPlan.revisionNumber,
    planJson: aiResult.plan,
    source: 'human',
    status: 'active',
  });

  // Save the assistant reply (linked to the new revision)
  await chatRepo.create({
    projectId,
    role: 'assistant',
    content: aiResult.reply,
    planRevisionId: newRevision.id,
    changes: aiResult.changes,
  });

  logger.info({ projectId, revision: nextRevision, changes: aiResult.changes.length }, 'Chat edit applied');

  return c.json({
    reply: aiResult.reply,
    revision: nextRevision,
    changes: aiResult.changes,
    plan: aiResult.plan,
  });
});
