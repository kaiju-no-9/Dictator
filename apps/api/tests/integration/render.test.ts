import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../../../packages/shared/src/index.js';

describe('Render Configuration Integration', () => {
  it('should enforce maximum transition duration and timeline duration limits', () => {
    expect(LIMITS.TRANSITION_DURATION_MAX).toBe(5.0);
    expect(LIMITS.TIMELINE_DURATION_MAX).toBe(14400);
    expect(LIMITS.SPEED_MIN).toBe(0.1);
    expect(LIMITS.SPEED_MAX).toBe(10.0);
  });
});
