import { test, expect } from '@playwright/test';

test('loads the app shell without crashing', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // `/` sends an anonymous visitor to the sign-in app, which e2e doesn't run;
  // the invitation page is public and renders the same shell.
  await page.goto('/invite');

  // The shared layout shows the brand as its logo, not as text.
  await expect(page.getByRole('img', { name: 'Visin' }).first()).toBeAttached();
  expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
});

test('follows the device between light and dark before the first paint', async ({ page }, testInfo) => {
  const scheme = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light';

  // Public, so it renders here rather than sending the visitor to sign in.
  await page.goto('/invite');

  await expect(page.locator('html')).toHaveAttribute('data-color-scheme', scheme);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    scheme === 'dark' ? '#0b0f17' : '#f6f7fb'
  );
});
