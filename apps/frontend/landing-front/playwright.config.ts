import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  // The dev server compiles each page on its first request: the docs (Markdown
  // and highlighting) and the API reference (a 3 MB chunk) take longer than the
  // 5 s default when the tests ask for them at once, as they do on a cold start.
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
