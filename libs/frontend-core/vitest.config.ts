import { defineConfig } from 'vitest/config';
import { availableParallelism, freemem } from 'os';

export default defineConfig({
  test: {
    // Up to 16 workers, fewer when memory is short (about one per free GB), so a busy
    // machine or a second run gets fewer instead of running out, as one did at a worker per core.
    maxWorkers: Math.max(1, Math.min(16, availableParallelism(), Math.floor(freemem() / 2 ** 30))),
    // Bundle these once instead of re-importing thousands of modules in every test file
    // (vision-front: 33s -> 17s). A package a test replaces with vi.mock cannot be listed.
    deps: { optimizer: { client: { enabled: true, include: ['@mui/material', '@mui/icons-material'] } } },
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
        statements: 98,
        branches: 93,
        functions: 96,
        lines: 98,
      },
    },
  }
});
