import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { VISIN_FEDERATION_SHARED, VISIN_REMOTE_ENTRY, VISIN_REMOTE_MODULE } from '@visin/frontend-core/federation';
import { resolve } from 'path';
import { availableParallelism, freemem } from 'os';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Unit tests read no .env: a test stubs what it needs from import.meta.env,
  // so a developer's local .env cannot make a suite pass here and fail in CI.
  envDir: process.env.VITEST ? (false as const) : undefined,
  plugins: [
    react(),
    // Besides running standalone, account-front is a module-federation remote:
    // shell-front loads `./App` from this origin's remoteEntry.js. Vitest has no
    // use for the federation build, so it is left out there.
    ...(process.env.VITEST
      ? []
      : [
          federation({
            name: 'account',
            filename: VISIN_REMOTE_ENTRY,
            exposes: { [VISIN_REMOTE_MODULE]: './src/federation/RemoteApp.tsx' },
            shared: VISIN_FEDERATION_SHARED,
            dts: false
          })
        ])
  ],
  server: {
    port: 3007,
    // Absolute asset URLs in dev, so the shell's page fetches them from here.
    origin: 'http://localhost:3007'
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
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
        statements: 97.5,
        branches: 94.5,
        functions: 98.5,
        lines: 99,
      },
    },
  },
}));
