import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { VISIN_FEDERATION_SHARED } from '@visin/frontend-core/federation';
import { availableParallelism, freemem } from 'os';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Unit tests read no .env: a test stubs what it needs from import.meta.env,
  // so a developer's local .env cannot make a suite pass here and fail in CI.
  envDir: process.env.VITEST ? (false as const) : undefined,
  plugins: [
    react(),
    // The module-federation host. No remotes are listed: where vision, label
    // and account live is deployment config, so their URLs come from
    // config.json at runtime and are registered in `src/remotes.ts`. Vitest has
    // no use for the federation build, so it is left out there.
    ...(process.env.VITEST
      ? []
      : [federation({ name: 'shell', remotes: {}, shared: VISIN_FEDERATION_SHARED, dts: false })])
  ],
  server: {
    port: 3010
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false
  },
  test: {
    // Up to 16 workers, fewer when memory is short (about one per free GB), so a busy
    // machine or a second run gets fewer instead of running out, as one did at a worker per core.
    maxWorkers: Math.max(1, Math.min(16, availableParallelism(), Math.floor(freemem() / 2 ** 30))),
    // Bundle these once instead of re-importing thousands of modules in every test file
    // (vision-front: 33s -> 17s). A package a test replaces with vi.mock cannot be listed.
    deps: { optimizer: { client: { enabled: true, include: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled'] } } },
    globals: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8' as const,
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      // Floor set just below current coverage so CI catches regressions;
      // ratchet these up as more tests are added.
      thresholds: {
        statements: 93,
        branches: 88,
        functions: 92,
        lines: 93,
      },
    },
  },
}));
