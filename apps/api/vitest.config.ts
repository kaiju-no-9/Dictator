import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@dictator/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
