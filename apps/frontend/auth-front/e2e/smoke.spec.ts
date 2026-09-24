import { test, expect } from '@playwright/test';

test('loads the app shell without crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');

  await expect(page.getByText('Visin').first()).toBeAttached();
  expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
});

test('follows the device between light and dark before the first paint', async ({ page }, testInfo) => {
  const scheme = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light';

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', scheme);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    scheme === 'dark' ? '#0b0f17' : '#f6f7fb'
  );
});
