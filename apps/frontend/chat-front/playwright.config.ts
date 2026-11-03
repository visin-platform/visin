import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:3014', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:3014', reuseExistingServer: !process.env.CI, timeout: 30000 },
    {
      command: 'npm run dev --workspace=shell-front',
      url: 'http://localhost:3010',
      reuseExistingServer: !process.env.CI,
      timeout: 30000
    }
  ]
});
