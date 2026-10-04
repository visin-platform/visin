import type { Config } from 'jest';
import { freemem } from 'os';

const config: Config = {
  // At most 4 test processes, fewer when memory is short (about one per 2 free GB).
  // More don't help: a run is bound by its slowest suite (~5s), and one per core
  // (19 here) took ~10 GB per workspace and ran this machine out of memory.
  maxWorkers: Math.max(1, Math.min(4, Math.floor(freemem() / 2 ** 31))),
  testEnvironment: 'node',
  // Stops a run started without `--experimental-vm-modules` (e.g. `npx jest`) at once, with the
  // reason: the mongodb driver needs the flag under Jest, and without it every in-memory MongoDB
  // suite fails to connect and then hangs the run. See the script.
  globalSetup: '<rootDir>/../../../scripts/jest-need-vm-modules.cjs',
  // A suite whose setup fails never reaches its teardown (mongod keeps running, Jest keeps
  // waiting): exit when the results are in, whatever it left behind.
  forceExit: true,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
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
