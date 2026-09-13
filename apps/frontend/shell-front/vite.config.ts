import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { VISIN_FEDERATION_SHARED } from '@visin/frontend-core/federation';

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
        statements: 93,
        branches: 88,
        functions: 92,
        lines: 93,
      },
    },
  },
}));
