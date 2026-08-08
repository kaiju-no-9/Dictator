import { describe, it, expect } from 'vitest';
import type { TimelineEntry } from '@dictator/shared';

function reorderTimeline(timeline: TimelineEntry[], fromIndex: number, toIndex: number): TimelineEntry[] {
  const result = [...timeline];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

function removeShotFromTimeline(timeline: TimelineEntry[], shotId: string): TimelineEntry[] {
  return timeline.filter((e) => e.shot_id !== shotId);
}

describe('Timeline Operations', () => {
  const sampleTimeline: TimelineEntry[] = [
    { shot_id: 'shot_0001', trim_in: 0, trim_out: 5, transition_in: 'hard_cut' },
    { shot_id: 'shot_0002', trim_in: 0, trim_out: 10, transition_in: 'crossfade' },
    { shot_id: 'shot_0003', trim_in: 2, trim_out: 8, transition_in: 'hard_cut' },
  ];

  it('should reorder timeline shots correctly', () => {
    const reordered = reorderTimeline(sampleTimeline, 0, 2);
    expect(reordered[0].shot_id).toBe('shot_0002');
    expect(reordered[1].shot_id).toBe('shot_0003');
    expect(reordered[2].shot_id).toBe('shot_0001');
  });

  it('should remove a shot from timeline correctly', () => {
    const updated = removeShotFromTimeline(sampleTimeline, 'shot_0002');
    expect(updated).toHaveLength(2);
    expect(updated.some((e) => e.shot_id === 'shot_0002')).toBe(false);
  });
});
