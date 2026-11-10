import { defineConfig } from 'vitest/config';
import { freemem } from 'node:os';
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    maxWorkers: Math.max(1, Math.min(4, Math.floor(freemem() / 2 ** 31))),
    include: ['src/**/__tests__/**/*.test.ts'],
    globalSetup: '../../../scripts/vitest-mongo-setup.mjs',
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/**/*.d.ts'],
      thresholds: { statements: 92, branches: 85, functions: 92, lines: 94 }
    }
  }
});
