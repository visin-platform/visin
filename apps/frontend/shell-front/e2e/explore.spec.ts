import { expect, test } from '@playwright/test';

test('visitors see public evidence, accurate counts and a working path into the catalogue', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const now = new Date().toISOString();
  const picture = 'http://localhost:3010/public-preview.png';
  await page.route('**/public-preview.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64'
      )
    })
  );
  await page.route(/^http:\/\/localhost:(4010|5001|5006|5008|5010|5012)\//, async (route) => {
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
      return route.fulfill({ headers, json: { success: false, authenticated: false } });
    let data: unknown = [];
    if (url.pathname === '/api/public/projects')
      data = {
        projects: [
          {
            id: 'p1',
            name: 'Public experiment',
            visibility: 'public',
            owner: { kind: 'user', id: 'u1' },
            updatedAt: now,
            runs: 9,
            lastRunAt: now,
            coverUrl: picture
          },
          {
            id: 'p2',
            name: 'Public study',
            visibility: 'public',
            owner: { kind: 'user', id: 'u1' },
            updatedAt: now,
            runs: 3,
            lastRunAt: now
          }
        ],
        pagination: { page: 1, pages: 1, total: 2 }
      };
    else if (url.pathname === '/api/datasets')
      data = {
        datasets: [
          {
            _id: 'd1',
            name: 'Street scenes',
            visibility: 'public',
            owner: { kind: 'user', id: 'u1' },
            imageCount: 12000,
            groups: [],
            coverUrl: picture,
            license: { id: 'cc-by-4.0', name: 'CC BY 4.0' },
            updatedAt: now
          }
        ],
        pagination: { page: 1, pages: 1, total: 1 }
      };
    else if (url.pathname === '/api/models') {
      // One checkpoint stored in two formats, in a project with a picture.
      const row = (id: string, format: 'onnx' | 'pth') => ({
        model: {
          _id: id,
          provider: 'visin',
          format,
          filename: `net-epoch176.${format}`,
          status: 'ready',
          license: { id: 'cc-by-4.0' },
          addedAt: now
        },
        training: { _id: 't1', name: 'Fusion run' },
        project: { _id: 'p1', name: 'Public experiment', coverUrl: picture }
      });
      data = { models: [row('m1', 'onnx'), row('m2', 'pth')], pagination: { page: 1, pages: 1, total: 1 } };
    } else if (url.pathname.includes('leaderboard')) data = { direction: 'max', entries: [] };
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/');
  const intro = page.getByRole('region', { name: 'About Visin' });
  await expect(intro.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(intro.getByRole('img', { name: 'Public dataset preview: Street scenes' })).toBeVisible();
  await expect(
    intro
      .locator('div')
      .filter({ has: page.locator('dt', { hasText: 'Recorded runs' }) })
      .last()
      .locator('dd')
  ).toHaveText('12');
  await expect(intro.getByRole('link', { name: 'Explore Street scenes' })).toHaveAttribute('href', '/datasets/d1');
  await page.screenshot({ path: `/tmp/visin-explore-${test.info().project.name}.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/visin-explore-mobile-${test.info().project.name}.png`, fullPage: true });
  await intro.getByRole('button', { name: 'Explore projects' }).click();
  await expect(page.getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Public experiment', exact: true })).toBeVisible();
  // The checkpoint's two files are one card, over the project's picture.
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  const modelCard = page
    .getByRole('article')
    .filter({ has: page.getByRole('link', { name: 'net-epoch176', exact: true }) });
  await expect(modelCard).toHaveCount(1);
  await expect(modelCard.getByText(/Visin · \.onnx · \.pth/)).toBeVisible();
  await expect(modelCard.locator('img')).toHaveAttribute('src', picture);
  await page.screenshot({ path: `/tmp/visin-explore-models-${test.info().project.name}.png` });
});
