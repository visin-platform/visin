import { test, expect } from '@playwright/test';

test('loads the app shell without crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  await expect(page.getByText('Visin').first()).toBeAttached();
  expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
});
