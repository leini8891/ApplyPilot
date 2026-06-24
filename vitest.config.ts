import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
      '@applypilot/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@applypilot/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@applypilot/ui': path.resolve(__dirname, 'packages/ui/src/index.tsx'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts']
  }
});
