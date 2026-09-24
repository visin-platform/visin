import { defineConfig, loadEnv } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { availableParallelism, freemem } from 'os';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Unit tests read no .env: a test stubs what it needs, so a developer's local
  // .env cannot make a suite pass here and fail in CI.
  const envDir = process.env.VITEST ? false : process.cwd();
  const env = loadEnv(mode, envDir);

  return {
    envDir,
    plugins: [react()],
    server: {
      port: 3004
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    define: {
      'process.env': env // Expose .env variables to the app
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
        provider: 'v8',
        reporter: ['text', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
        // Floor set just below current coverage so CI catches regressions;
        // ratchet these up as more tests are added.
        thresholds: {
          statements: 98,
          branches: 95,
          functions: 95,
          lines: 99,
        },
      },
    },
  };
});
