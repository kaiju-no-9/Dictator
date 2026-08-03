import { planRepo } from '../db/repositories/plan.js';
import { validateEditPlan } from '@dictator/shared';
import type { EditPlan } from '@dictator/shared';
import { logger } from '../middleware/logger.js';

/**
 * Applies a human edit to an existing plan.
 * Validates it, then saves as a new revision if valid.
 */
export const editorService = {
  async applyEdit(projectId: string, updatedPlan: EditPlan) {
    // Run structural validation
    const result = validateEditPlan(updatedPlan);

    if (!result.valid) {
      logger.warn(
        { projectId, fatal: result.fatal_count, errors: result.error_count },
        'Human edit failed validation'
      );
      return { success: false, violations: result.violations };
    }

    // Persist as a new human revision
    const latest = await planRepo.findLatest(projectId);
    const nextRev = (latest?.revisionNumber ?? 0) + 1;

    const revision = await planRepo.create({
      projectId,
      revisionNumber: nextRev,
      parentRevision: latest?.revisionNumber ?? null,
      planJson: updatedPlan,
      source: 'human',
      status: 'active',
    });

    logger.info({ projectId, revision: nextRev }, 'Human edit saved');
    return { success: true, revision };
  },
};
