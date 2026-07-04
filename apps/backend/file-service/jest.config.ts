import type { Config } from 'jest';

const config: Config = {
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
      statements: 4,
      branches: 2,
      functions: 6,
      lines: 4,
    },
  },
};

export default config;
