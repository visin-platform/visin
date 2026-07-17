import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react()],
  server: {
    port: 3012
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
        statements: 90,
        branches: 79,
        functions: 86,
        lines: 91,
      },
    },
  },
}));
