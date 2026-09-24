import type { Config } from 'jest';
import { freemem } from 'os';

const config: Config = {
  // At most 4 test processes, fewer when memory is short (about one per 2 free GB).
  // More don't help: a run is bound by its slowest suite (~5s), and one per core
  // (19 here) took ~10 GB per workspace and ran this machine out of memory.
  maxWorkers: Math.max(1, Math.min(4, Math.floor(freemem() / 2 ** 31))),
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  // Floor set just below current coverage so CI catches regressions;
  // ratchet these up as more tests are added.
  coverageThreshold: {
    global: {
      statements: 96,
      branches: 90,
      functions: 97,
      lines: 96,
    },
  },
};

export default config;
