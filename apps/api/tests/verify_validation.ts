import { validateEditPlan } from '../../../packages/shared/src/index.js';

console.log('=== Running Direct TS Validation Checks ===');

const validPlan = {
  version: '1.0.0',
  project_id: '123e4567-e89b-12d3-a456-426614174000',
  created_at: new Date().toISOString(),
  revision: 1,
  parent_revision: null,
  source_shots: [
    { shot_id: 'shot_0001', source_file: 'v1.mp4', start: 0, end: 10 },
  ],
  timeline: [
    { shot_id: 'shot_0001', trim_in: 1, trim_out: 9, transition_in: 'hard_cut' },
  ],
  audio: {},
};

const res1 = validateEditPlan(validPlan as any);
console.log('Valid Plan Check:', res1.valid ? 'PASSED ✅' : 'FAILED ❌');
if (!res1.valid) console.error(res1.violations);

const invalidPlan = {
  ...validPlan,
  timeline: [{ shot_id: 'shot_9999', trim_in: 1, trim_out: 9, transition_in: 'hard_cut' }],
};

const res2 = validateEditPlan(invalidPlan as any);
console.log('V-001 Invalid Shot ID Check:', !res2.valid && res2.violations[0].rule_id === 'V-001' ? 'PASSED ✅' : 'FAILED ❌');

if (res1.valid && !res2.valid) {
  console.log('\nAll core TS validation rules verified successfully!');
} else {
  process.exit(1);
}
