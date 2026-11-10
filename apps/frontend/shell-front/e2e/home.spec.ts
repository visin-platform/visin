import { expect, test } from '@playwright/test';

test('home shows real activity trends and opens the analyst on the latest run on desktop and mobile', async ({
  page
}) => {
  const now = new Date().toISOString();
  const monday = new Date();
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const project = { _id: '111111111111111111111111', name: 'Research project', visibility: 'private', updatedAt: now };
  const training = {
    _id: '222222222222222222222222',
    projectId: project._id,
    name: 'Latest experiment',
    status: 'completed',
    updatedAt: now
  };
  await page.route(/^http:\/\/localhost:(4010|5001|5006|5010|5003|5008|5012)\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin ?? 'http://localhost:3010',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({
        headers,
        json: { success: true, authenticated: true, user: { id: 'alice', name: 'Alice', email: 'alice@example.test' } }
      });
    let data: unknown = [];
    if (url.pathname === '/api/trainings/stats')
      data = {
        totalHours: 8.5,
        weekly: [
          { week: monday.toISOString(), trainings: 8, hours: 6.5 },
          { week: new Date(monday.getTime() - 7 * 86400000).toISOString(), trainings: 4, hours: 2 }
        ]
      };
    else if (url.pathname === '/api/trainings')
      data = {
        trainings: url.searchParams.has('status') ? [] : [training],
        pagination: { total: url.searchParams.has('status') ? 0 : 12 }
      };
    else if (url.pathname === '/api/projects') data = [project];
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Alice/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Summary' }).getByText('8.5')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Trainings per week, last eight weeks (UTC)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask the analyst' })).toBeVisible();
  await page.screenshot({ path: `/tmp/visin-home-${test.info().project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/visin-home-mobile-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ask the analyst' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __visinChatContext?: unknown }).__visinChatContext))
    .toEqual({ kind: 'assistant', projectId: project._id, trainingIds: [training._id], title: training.name });
});
