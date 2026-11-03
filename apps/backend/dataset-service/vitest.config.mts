import { defineConfig } from 'vitest/config';
import { freemem } from 'node:os';
import { spawnSync } from 'node:child_process';
// Preserve local skips; CI must fail if its Redis installation is missing.
const redisMissing =
  !process.env.CI && spawnSync(process.env.REDIS_TEST_SERVER ?? 'redis-server', ['--version']).status !== 0;
if (redisMissing)
  console.warn(
    'dataset-service: Redis recovery tests skipped; install redis-server or set REDIS_TEST_SERVER. Coverage floors still apply.'
  );
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    maxWorkers: Math.max(1, Math.min(4, Math.floor(freemem() / 2 ** 31))),
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: redisMissing ? ['**/integration/jobRecovery.test.ts'] : [],
    globalSetup: '../../../scripts/vitest-mongo-setup.mjs',
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/__tests__/**', 'src/index.ts', 'src/**/*.d.ts', 'src/__tests__/**'],
      thresholds: { statements: 98, branches: 94, functions: 98, lines: 99 }
    }
  }
});
