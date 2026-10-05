import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The paper pages in a real browser, against an API that is faked in the page, for what the component tests cannot
 * see: a layout that overflows a phone, a colour pair too close to read in either scheme, and a page that throws.
 */

const PAPER = {
  id: 'pa1',
  title: 'Robust semantic segmentation of road scenes at night, in rain and in snow, with camera and lidar fusion',
  abstract:
    'We measure how fusion models hold up when the light goes and the weather turns, and report every number from results recorded on Visin.',
  authors: [
    { name: 'Ann Lee', status: 'confirmed', user: { id: 'u1', handle: 'ann-lee', name: 'Ann Lee' } },
    { name: 'Bo Wu' },
    { name: 'Cy Ode' }
  ],
  venue: 'CVPR',
  year: 2025,
  arxivId: '2401.01234',
  doi: '10.1000/night.1',
  tags: ['segmentation', 'fusion', 'weather'],
  owner: { kind: 'user', id: 'u1', name: 'Ann Lee' },
  visibility: 'public',
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-02T10:00:00.000Z'
};
const CARD = { ...PAPER, results: { cited: 3, available: 2 } };
const DETAIL = {
  ...PAPER,
  url: 'https://example.test/paper',
  results: [
    { kind: 'project', available: true, ref: 'p1', name: 'ZOD weather ablations', note: 'Table 2' },
    { kind: 'leaderboard', available: true, ref: 'zod-weather@1', name: 'ZOD, five weather test sets', project: { id: 'p1', name: 'ZOD weather ablations' } },
    { kind: 'training', available: false }
  ]
};

async function mockApi(page: Page) {
  await page.route(/^http:\/\/localhost:(4010|5001)\//, async (route: Route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3012',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const { pathname } = new URL(request.url());
    let status = 200;
    let body: unknown = { success: true, data: [] };
    if (pathname === '/api/public/papers') {
      body = { success: true, data: { papers: [CARD, { ...CARD, id: 'pa2', title: 'Short title', abstract: undefined }], pagination: { page: 1, limit: 12, total: 2, pages: 1 } } };
    } else if (pathname === '/api/papers/pa1') {
      body = { success: true, data: DETAIL };
    } else if (pathname.startsWith('/api/papers/')) {
      status = 404;
      body = { success: false, error: 'Not found', message: 'Paper not found' };
    }
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const PAGES: { path: string; heading: string; name: string; titled?: false }[] = [
  { path: '/papers', heading: 'Papers', name: 'papers' },
  { path: '/papers/pa1', heading: PAPER.title, name: 'paper' },
  // What stands in for a page that is not there is an empty state, not a heading.
  { path: '/papers/missing', heading: 'Paper not found', name: 'paper-missing', titled: false }
];

test.describe('paper pages', () => {
  test.beforeEach(async ({ page }) => mockApi(page));

  test('the list leads to a paper, which shows what it cites', async ({ page }) => {
    await page.goto('/papers');
    await page.getByRole('link', { name: PAPER.title }).click();

    await expect(page).toHaveURL(/\/papers\/pa1$/);
    await expect(page.getByRole('link', { name: 'ZOD weather ablations', exact: true })).toBeVisible();
    await expect(page.getByText('Run no longer public')).toBeVisible();
  });

  for (const { path, heading, name, titled = true } of PAGES) {
    test(`${name}: renders, has no serious accessibility problems, and fits a phone`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto(path);
      await expect((titled ? page.getByRole('heading', { name: heading }) : page.getByText(heading)).first()).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);

      const scheme = testInfo.project.name.endsWith('dark') ? 'dark' : 'light';
      await page.screenshot({ path: testInfo.outputPath(`${name}-${scheme}-desktop.png`), fullPage: true });

      const scan = await new AxeBuilder({ page }).analyze();
      const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
      expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${scheme}-phone.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);

      expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
    });
  }
});
