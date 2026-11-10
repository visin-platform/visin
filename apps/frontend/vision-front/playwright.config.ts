import { defineConfig, devices } from '@playwright/test';

const PORT = 3012;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The same run with the device set to dark: every page must render, and follow it.
    { name: 'chromium-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } }
  ],
  webServer: {
    command: 'npm run dev',
    // Match the mocked API origins without depending on a developer's .env.
    env: {
      VITE_VISION_API_URL: 'http://localhost:4010',
      VITE_DATASET_API_URL: 'http://localhost:5010',
      VITE_AUTH_SERVICE_URL: 'http://localhost:5001'
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
