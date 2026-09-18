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
    '!src/__tests__/**',
  ],
  coverageReporters: ['text', 'lcov'],
  coverageDirectory: 'coverage',
  // Floor set just below current coverage so CI catches regressions;
  // ratchet these up as more tests are added.
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 90,
      functions: 96,
      lines: 98,
    },
  },
};

export default config;
