import { expect, test } from '@playwright/test';

test('dataset loading preserves the card layout and empty lists offer a next step', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/^http:\/\/localhost:(4010|5001|5006|5010)\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin ?? 'http://localhost:3012',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({
        headers,
        json: { success: true, authenticated: true, user: { id: 'alice', email: 'alice@example.test' } }
      });
    let data: unknown = [];
    if (url.pathname === '/api/datasets') {
      await gate;
      data = { datasets: [], pagination: { page: 1, total: 0, pages: 0 } };
    } else if (url.pathname === '/api/models') data = { models: [], pagination: { page: 1, total: 0, pages: 0 } };
    else if (url.pathname === '/api/evaluations')
      data = { evaluations: [], pagination: { page: 1, total: 0, pages: 0 } };
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/datasets');
  await expect(page.getByRole('status', { name: 'Loading datasets' })).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Upload dataset', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('textbox', { name: /Search/ }).fill('missing');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('textbox', { name: /Search/ })).toHaveValue('');
  await page.goto('/models');
  await expect(page.getByRole('link', { name: 'View trainings' })).toBeVisible();
  await page.goto('/evaluations');
  await expect(page.getByRole('link', { name: 'View trainings' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/visin-empty-evaluations-${test.info().project.name}.png` });
});
