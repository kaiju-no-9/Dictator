import { describe, it, expect } from 'vitest';
import { editPlanSchema } from '../../../../packages/shared/src/index.js';

describe('editPlanSchema Zod validation', () => {
  it('should successfully parse a valid EditPlan input', () => {
    const raw = {
      version: '1.0.0',
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      created_at: new Date().toISOString(),
      revision: 1,
      parent_revision: null,
      source_shots: [
        {
          shot_id: 'shot_0001',
          source_file: 'sample.mp4',
          start: 0,
          end: 5,
        },
      ],
      timeline: [
        {
          shot_id: 'shot_0001',
          trim_in: 0,
          trim_out: 5,
          transition_in: 'hard_cut',
        },
      ],
      audio: {},
    };

    const parsed = editPlanSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it('should reject invalid shot_id pattern', () => {
    const raw = {
      version: '1.0.0',
      project_id: '123e4567-e89b-12d3-a456-426614174000',
      created_at: new Date().toISOString(),
      revision: 1,
      parent_revision: null,
      source_shots: [
        {
          shot_id: 'bad_id_123',
          source_file: 'sample.mp4',
          start: 0,
          end: 5,
        },
      ],
      timeline: [
        {
          shot_id: 'bad_id_123',
          trim_in: 0,
          trim_out: 5,
          transition_in: 'hard_cut',
        },
      ],
      audio: {},
    };

    const parsed = editPlanSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
  });
});
