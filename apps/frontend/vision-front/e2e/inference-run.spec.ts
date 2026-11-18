import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * A model judging a frame set: its page says how far it has got and how it is judging so far, in frames and
 * never in epochs. Running rates are reported as a mapping per class, which the page draws as one line each.
 */
test('an inference run shows its progress in frames, its running rates, and fits a phone', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const point = (done: number, minute: number) => ({
    _id: `p${done}`,
    trainingId: 'judge',
    training_uuid: 'qwen-third',
    epoch_uuid: `point-${done}`,
    epoch: done,
    timestamp: new Date(Date.UTC(2026, 10, 18, 0, minute)).toISOString(),
    results: {
      degenerate_rate: 0.01 + done / 100_000,
      reject_rate: { vehicle: 0.18, sign: 0.11 + done / 50_000, pedestrian: 0.35 },
      latency_ms: 11_000 + done
    }
  });
  const training = {
    _id: 'judge',
    uuid: 'qwen-third',
    name: 'Third backend on the paired frames',
    kind: 'inference',
    status: 'running',
    suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) },
    progress: { done: 300, total: 4110, unit: 'frame' },
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T03:00:00Z',
    lastSeenAt: new Date().toISOString(),
    metrics: { totalTime: 0, epochCount: 3, maxEpoch: 300, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
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
    if (pathname === '/api/trainings/judge/epochs') data = { training, epochs: [point(100, 0), point(200, 60), point(300, 120)] };
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/judge');
  await expect(page.getByRole('heading', { name: training.name }).first()).toBeVisible();
  await expect(page.getByText('running · 300 / 4,110 frames')).toBeVisible();
  await expect(page.getByText('100 frames per hour · about 38 h 6 min left at this pace')).toBeVisible();
  await expect(page.getByRole('link', { name: 'zod-sam-verification@1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Running rates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latency' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Progress' })).toBeVisible();
  await expect(page.getByText(/epoch/i)).toHaveCount(0);

  const scheme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.screenshot({ path: info.outputPath(`inference-${scheme}-desktop.png`), fullPage: true });
  const scan = await new AxeBuilder({ page }).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: info.outputPath(`inference-${scheme}-phone.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
