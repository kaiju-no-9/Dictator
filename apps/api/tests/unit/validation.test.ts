import { describe, it, expect } from 'vitest';
import { validateEditPlan, type EditPlan } from '../../../../packages/shared/src/index.js';

const validPlan: EditPlan = {
  version: '1.0.0',
  project_id: '123e4567-e89b-12d3-a456-426614174000',
  created_at: new Date().toISOString(),
  revision: 1,
  parent_revision: null,
  source_shots: [
    {
      shot_id: 'shot_0001',
      source_file: 'video1.mp4',
      start: 0,
      end: 10,
      duration: 10,
      quality_score: 4,
    },
    {
      shot_id: 'shot_0002',
      source_file: 'video1.mp4',
      start: 10,
      end: 25,
      duration: 15,
      quality_score: 5,
    },
  ],
  timeline: [
    {
      shot_id: 'shot_0001',
      trim_in: 1,
      trim_out: 9,
      transition_in: 'fade_in',
      transition_duration: 1.0,
      source_audio: 'keep',
      speed: 1.0,
    },
    {
      shot_id: 'shot_0002',
      trim_in: 12,
      trim_out: 22,
      transition_in: 'crossfade',
      transition_duration: 1.5,
      source_audio: 'keep',
      speed: 1.0,
    },
  ],
  audio: {},
};

describe('validateEditPlan', () => {
  it('should pass for a completely valid EditPlan', () => {
    const result = validateEditPlan(validPlan);
    expect(result.valid).toBe(true);
    expect(result.fatal_count).toBe(0);
  });

  it('should fail (V-001) if timeline references non-existent shot_id', () => {
    const invalid = {
      ...validPlan,
      timeline: [
        ...validPlan.timeline,
        {
          shot_id: 'shot_9999',
          trim_in: 0,
          trim_out: 5,
          transition_in: 'hard_cut' as const,
        },
      ],
    };

    const result = validateEditPlan(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule_id === 'V-001')).toBe(true);
  });

  it('should fail (V-004) if trim_in >= trim_out', () => {
    const invalid = {
      ...validPlan,
      timeline: [
        {
          shot_id: 'shot_0001',
          trim_in: 5,
          trim_out: 5,
          transition_in: 'hard_cut' as const,
        },
      ],
    };

    const result = validateEditPlan(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule_id === 'V-004')).toBe(true);
  });

  it('should fail (V-002) if trim_in < shot.start', () => {
    const invalid = {
      ...validPlan,
      timeline: [
        {
          shot_id: 'shot_0002',
          trim_in: 5,
          trim_out: 20,
          transition_in: 'hard_cut' as const,
        },
      ],
    };

    const result = validateEditPlan(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule_id === 'V-002')).toBe(true);
  });

  it('should fail (V-003) if trim_out > shot.end', () => {
    const invalid = {
      ...validPlan,
      timeline: [
        {
          shot_id: 'shot_0001',
          trim_in: 0,
          trim_out: 15,
          transition_in: 'hard_cut' as const,
        },
      ],
    };

    const result = validateEditPlan(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule_id === 'V-003')).toBe(true);
  });

  it('should fail (V-012) if source_shots is empty', () => {
    const invalid = {
      ...validPlan,
      source_shots: [],
    };

    const result = validateEditPlan(invalid);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.rule_id === 'V-012')).toBe(true);
  });
});
