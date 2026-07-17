import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Vitest v4 only reports files imported by tests unless include is set —
      // without it, entirely untested source files are invisible to coverage.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts', 'src/**/*.test.{ts,tsx}', 'src/index.ts'],
      // Floor set just below current coverage so CI catches regressions;
      // ratchet these up as more tests are added.
      thresholds: {
        statements: 95,
        branches: 77,
        functions: 88,
        lines: 95,
      },
    },
  }
});
