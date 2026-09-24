import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkGfm from 'remark-gfm';
import rehypeShiki from '@shikijs/rehype';
import type { ShikiTransformer } from 'shiki';
import { resolve } from 'path';
import { availableParallelism, freemem } from 'os';

/**
 * Docs code blocks are highlighted here, at build time, so the browser gets
 * coloured HTML and no highlighter. The language and an optional
 * ```python title="train.py"``` title ride along as data attributes for the
 * page's CodeBlock to label the block with.
 */
const codeBlockMeta: ShikiTransformer = {
  pre(node) {
    node.properties['data-language'] = this.options.lang;
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1];
    if (title) node.properties['data-title'] = title;
  }
};

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Unit tests read no .env: a test stubs what it needs from import.meta.env,
  // so a developer's local .env cannot make a suite pass here and fail in CI.
  envDir: process.env.VITEST ? (false as const) : undefined,
  plugins: [
    {
      enforce: 'pre' as const,
      ...mdx({
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypeShiki, { theme: 'github-dark-default', transformers: [codeBlockMeta] }]]
      })
    },
    react({ include: /\.(mdx|jsx|tsx)$/ })
  ],
  server: {
    port: 3000
  },
  // Pre-bundled when the dev server starts. Found only when /docs/api first
  // asks for it, Vite would optimize it then and reload the page mid-load.
  optimizeDeps: {
    include: ['@scalar/api-reference-react']
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
    // Split, unlike the federated fronts: the API reference brings 300 KB of
    // CSS with global rules, which must load with its page and not the landing page.
    cssCodeSplit: true
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
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
}));
