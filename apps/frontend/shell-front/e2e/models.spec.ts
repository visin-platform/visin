import { expect, test } from '@playwright/test';

test('Explore finds public models from both stores and offers the Models navigation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^http:\/\/localhost:(4010|5001|5006|5010)\//, async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3010',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(request.url());
    let data: unknown = [];
    if (url.pathname === '/api/models') {
      const models = [
        {
          model: {
            _id: 'm1',
            provider: 'visin',
            filename: 'clft.pth',
            format: 'pth',
            status: 'ready',
            license: { id: 'cc-by-4.0', name: 'CC BY 4.0' }
          },
          training: { _id: 't1', name: 'Iseauto CLFT' }
        },
        {
          model: { _id: 'm2', provider: 'hf', repo: 'team/clft', revision: 'abcdef123456' },
          training: { _id: 't2', name: 'Hub run' }
        }
      ];
      const filtered = url.searchParams.get('search') === 'iseauto' ? models.slice(0, 1) : models;
      data = { models: filtered, pagination: { page: 1, limit: 12, total: filtered.length, pages: 1 } };
    } else if (url.pathname === '/api/public/projects') {
      data = { projects: [], pagination: { page: 1, pages: 0 } };
    } else if (url.pathname === '/api/datasets') {
      data = { datasets: [], pagination: { page: 1, pages: 0 } };
    } else if (url.pathname === '/api/evaluations/leaderboard') {
      data = { direction: 'max', entries: [] };
    }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  await page.goto('/?type=models');
  await expect(page.getByRole('button', { name: 'Models', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'clft.pth', exact: true })).toHaveAttribute('href', '/trainings/t1');
  await expect(page.getByRole('link', { name: 'team/clft @ abcdef1', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search the catalogue' }).fill('iseauto');
  await expect(page.getByRole('link', { name: 'team/clft @ abcdef1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'clft.pth', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Models', exact: true }).first()).toHaveAttribute('href', '/models');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: 'clft.pth', exact: true })).toBeVisible();
  // The layout follows the viewport a frame later, so poll: a page that stays wider than the phone still fails.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  expect(errors).toEqual([]);
});
