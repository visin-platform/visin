import { expect, test } from '@playwright/test';

/** A project with several runs: its overview ranks them and shows the best result so far, run by run. */
/** Six runs over weeks, and eighty that came in bursts over a fortnight, as a long benchmark does. */
const SCENARIOS = [
  { title: 'a few runs', count: 6, byDate: true },
  { title: 'a long benchmark of many runs', count: 80, byDate: false }
];

for (const scenario of SCENARIOS) {
  test(`the project overview ranks the runs and shows progress over time: ${scenario.title}`, async ({
    page
  }, info) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const { count } = scenario;
    const values = Array.from({ length: count }, (_, i) =>
      count === 6
        ? [0.52, 0.47, 0.6, 0.66, 0.64, 0.73][i]
        : Math.min(0.78, 0.3 + 0.45 * (1 - Math.exp(-i / 14)) + 0.18 * Math.sin(i * 12.9898) * Math.cos(i * 4.1))
    );
    const ranking = values
      .map((value, i) => ({
        training: {
          _id: `t${i}`,
          name: `run ${i + 1}`,
          status: i === count - 1 ? 'running' : 'completed',
          createdAt: new Date(Date.UTC(2026, 8, 1 + (count === 6 ? i * 6 : Math.floor(i / 8)))).toISOString()
        },
        value,
        epoch: 40 + (i % 9) * 20
      }))
      .sort((a, b) => b.value - a.value);
    const project = {
      _id: 'p1',
      name: 'Road segmentation',
      slug: 'road',
      description: 'Benchmarks',
      visibility: 'public',
      owner: { kind: 'user', id: 'u9' },
      permissions: { read: true, contribute: false, manage: false, own: false },
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-10-20T00:00:00Z'
    };
    await page.route(/^http:\/\/localhost:(4010|5001)\//, async (route) => {
      const request = route.request();
      const headers = {
        'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3012',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type, authorization, x-request-id',
        'access-control-allow-methods': 'GET, OPTIONS'
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const { pathname } = new URL(request.url());
      let data: unknown = [];
      if (pathname === '/api/projects/road' || pathname === '/api/projects/p1') data = project;
      else if (pathname === '/api/trainings/best')
        data = {
          runs: count,
          ranking,
          best: {
            training: {
              _id: ranking[0].training._id,
              uuid: 'u',
              name: ranking[0].training.name,
              status: 'completed',
              projectId: 'p1'
            },
            project: { _id: 'p1', name: 'Road segmentation' },
            metric: { path: 'val.mean_iou', direction: 'higher', directionFrom: 'default', source: 'guessed' },
            value: ranking[0].value,
            epoch: ranking[0].epoch
          }
        };
      else if (pathname.startsWith('/api/public/papers') || pathname === '/api/papers')
        data = { papers: [], pagination: { total: 0, page: 1, limit: 10, pages: 0 } };
      else if (pathname === '/api/trainings/stats')
        data = { totalTrainings: count, totalTime: 80000, avgEpochTime: 120, totalCost: 0 };
      return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });

    await page.goto('/projects/road');
    const table = page.getByRole('table', { name: /Runs ranked by/ });
    await expect(table).toBeVisible();
    const rows = table.getByRole('row');
    await expect(rows).toHaveCount(Math.min(count, 8) + 1);
    await expect(rows.nth(1)).toContainText(ranking[0].training.name);
    await expect(page.getByText(new RegExp(`over ${count} runs`))).toBeVisible();
    await expect(page.getByText(scenario.byDate ? /Sep \d+/ : /Run, oldest to newest/).first()).toBeVisible();
    await page.getByRole('heading', { name: /Runs ranked by/ }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath(`project-overview-${count}.png`) });
    await page.getByRole('button', { name: count > 8 ? `All ${count} trainings` : 'Open trainings' }).click();
    await expect(page).toHaveURL(/tab=trainings/);
    expect(errors).toEqual([]);
  });
}
