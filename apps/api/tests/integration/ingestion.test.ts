import { describe, it, expect } from 'vitest';
import { ALLOWED_VIDEO_MIMES } from '../../../../packages/shared/src/index.js';

describe('Ingestion Service Integration', () => {
  it('should validate allowed video MIME types', () => {
    expect(ALLOWED_VIDEO_MIMES.has('video/mp4')).toBe(true);
    expect(ALLOWED_VIDEO_MIMES.has('video/quicktime')).toBe(true);
    expect(ALLOWED_VIDEO_MIMES.has('application/pdf')).toBe(false);
  });
});
