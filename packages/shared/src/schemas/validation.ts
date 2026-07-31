import type { EditPlan, SourceShot } from '../types/edit-plan';
import { LIMITS } from '../constants';

export type ValidationSeverity = 'fatal' | 'error' | 'warning';
export interface ValidationViolation { rule_id: string; severity: ValidationSeverity; message: string; field?: string; value?: unknown; }
export interface ValidationResult { valid: boolean; violations: ValidationViolation[]; fatal_count: number; error_count: number; warning_count: number; }

export function validateEditPlan(plan: EditPlan): ValidationResult {
  const violations: ValidationViolation[] = [];
  const shotMap = new Map<string, SourceShot>();

  if (!plan.source_shots || plan.source_shots.length === 0) {
    violations.push({ rule_id: 'V-012', severity: 'fatal', message: 'source_shots must not be empty' });
  } else {
    for (const shot of plan.source_shots) shotMap.set(shot.shot_id, shot);
  }

  if (!plan.timeline || plan.timeline.length === 0) {
    violations.push({ rule_id: 'V-013', severity: 'fatal', message: 'timeline must not be empty' });
  }

  let totalDuration = 0;
  if (plan.timeline) {
    for (let i = 0; i < plan.timeline.length; i++) {
      const entry = plan.timeline[i];
      const shot = shotMap.get(entry.shot_id);
      if (!shot) { violations.push({ rule_id: 'V-001', severity: 'fatal', message: `timeline[${i}].shot_id "${entry.shot_id}" not found in source_shots`, field: `timeline[${i}].shot_id` }); continue; }
      if (entry.trim_in >= entry.trim_out) violations.push({ rule_id: 'V-004', severity: 'fatal', message: `timeline[${i}]: trim_in (${entry.trim_in}) must be < trim_out (${entry.trim_out})` });
      if (entry.trim_in < shot.start) violations.push({ rule_id: 'V-002', severity: 'fatal', message: `timeline[${i}]: trim_in (${entry.trim_in}) < shot.start (${shot.start})` });
      if (entry.trim_out > shot.end) violations.push({ rule_id: 'V-003', severity: 'fatal', message: `timeline[${i}]: trim_out (${entry.trim_out}) > shot.end (${shot.end})` });
      if (entry.transition_duration !== undefined && (entry.transition_duration < 0 || entry.transition_duration > LIMITS.TRANSITION_DURATION_MAX)) violations.push({ rule_id: 'V-006', severity: 'fatal', message: `timeline[${i}]: transition_duration out of range` });
      if (entry.speed !== undefined && (entry.speed < LIMITS.SPEED_MIN || entry.speed > LIMITS.SPEED_MAX)) violations.push({ rule_id: 'V-007', severity: 'fatal', message: `timeline[${i}]: speed out of range` });
      if (entry.overlay_text && entry.overlay_text.length > LIMITS.OVERLAY_TEXT_MAX_LENGTH) violations.push({ rule_id: 'V-016', severity: 'warning', message: `timeline[${i}]: overlay_text too long` });
      totalDuration += (entry.trim_out - entry.trim_in) / (entry.speed ?? 1);
    }
    if (totalDuration < LIMITS.TIMELINE_DURATION_MIN) violations.push({ rule_id: 'V-015', severity: 'warning', message: `Total duration (${totalDuration.toFixed(1)}s) < ${LIMITS.TIMELINE_DURATION_MIN}s` });
    if (totalDuration > LIMITS.TIMELINE_DURATION_MAX) violations.push({ rule_id: 'V-015', severity: 'warning', message: `Total duration (${totalDuration.toFixed(1)}s) > 4 hours` });
  }

  if (plan.audio?.music) {
    for (let i = 0; i < plan.audio.music.length; i++) {
      const track = plan.audio.music[i];
      if (track.start >= track.end) violations.push({ rule_id: 'V-009', severity: 'fatal', message: `audio.music[${i}]: start >= end` });
      if (track.gain_curve_db) {
        for (let j = 1; j < track.gain_curve_db.length; j++) {
          if (track.gain_curve_db[j].t <= track.gain_curve_db[j-1].t) { violations.push({ rule_id: 'V-010', severity: 'fatal', message: `audio.music[${i}].gain_curve_db: t not monotonic at ${j}` }); break; }
        }
      }
    }
  }

  const fatal_count = violations.filter(v => v.severity === 'fatal').length;
  const error_count = violations.filter(v => v.severity === 'error').length;
  const warning_count = violations.filter(v => v.severity === 'warning').length;
  return { valid: fatal_count === 0 && error_count === 0, violations, fatal_count, error_count, warning_count };
}
