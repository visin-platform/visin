import type { Config } from 'jest';
import { spawnSync } from 'child_process';
import { freemem } from 'os';

// The queue-recovery suite runs BullMQ against a real Redis (a fake would not run its Lua scripts), so it needs the
// `redis-server` binary: CI installs it, and REDIS_TEST_SERVER may name a local one. Without it, a run on a developer
// machine skips that suite and says so, instead of failing every test in it. The coverage floors still apply, so
// such a run fails on coverage, which is the truth: it did not test everything. CI never skips: a missing binary
// there must stay a failure.
const REDIS_SUITE = '/integration/jobRecovery\\.test\\.ts$';
const redisMissing =
  !process.env.CI && spawnSync(process.env.REDIS_TEST_SERVER ?? 'redis-server', ['--version']).status !== 0;
if (redisMissing) {
  console.warn(
    'dataset-service: redis-server not found, so the queue-recovery suite (integration/jobRecovery) is skipped. ' +
      'Coverage will fall short of its floors without it; install redis-server, or set REDIS_TEST_SERVER, to run it.'
  );
}

const config: Config = {
  // At most 4 test processes, fewer when memory is short (about one per 2 free GB).
  // More don't help: a run is bound by its slowest suite (~5s), and one per core
  // (19 here) took ~10 GB per workspace and ran this machine out of memory.
  maxWorkers: Math.max(1, Math.min(4, Math.floor(freemem() / 2 ** 31))),
  testEnvironment: 'node',
  // Prepare one binary before suites start; downloads never run in test hooks.
  globalSetup: '<rootDir>/../../../scripts/jest-mongo-setup.mjs',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: redisMissing ? ['/node_modules/', REDIS_SUITE] : ['/node_modules/'],
  // Floor set just below current coverage so CI catches regressions;
  // ratchet these up as more tests are added.
  coverageThreshold: {
    global: {
      statements: 98,
      branches: 94,
      functions: 98,
      lines: 99,
    },
  },
};

export default config;
