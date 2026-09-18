import { test, expect } from '@playwright/test';

test('loads the app shell without crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  // The shared layout shows the brand as its logo, not as text.
  await expect(page.getByRole('img', { name: 'Visin' }).first()).toBeAttached();
  expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
});
