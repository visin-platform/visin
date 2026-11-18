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

/** Every decision the run recorded, filtered by the suite's own vocabularies, readable on a phone. */
test('an inference run lists its samples one by one and filters them by the suite vocabularies', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const training = {
    _id: 'judge',
    uuid: 'qwen-v2',
    name: 'qwen2.5vl_72b_v2',
    kind: 'inference',
    status: 'completed',
    suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) },
    progress: { done: 4110, total: 4110, unit: 'frame' },
    createdAt: '2026-11-18T00:00:00Z',
    updatedAt: '2026-11-18T03:00:00Z',
    metrics: { totalTime: 0, epochCount: 0, maxEpoch: 0, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
  };
  const suite = {
    _id: 's1',
    slug: 'zod-sam-verification',
    version: 1,
    digest: 'd'.repeat(64),
    protocol: {
      classes: [{ id: 'sign' }, { id: 'vehicle' }],
      conditions: [{ name: '<250', sampleCount: 1 }],
      metrics: [],
      samples: {
        attrs: [{ key: 'class', values: ['sign', 'vehicle'] }, { key: 'size', values: ['<250', '250–4000'] }, { key: 'frame' }],
        fields: [{ key: 'verdict', values: ['valid', 'invalid'] }, { key: 'outcome', values: ['keep', 'delete'] }]
      }
    }
  };
  const sample = (index: number, outcome: string) => ({
    id: `frame_${String(index).padStart(6, '0')}/m${index}`,
    attrs: { class: 'sign', size: '<250', frame: `frame_${String(index).padStart(6, '0')}` },
    fields: { verdict: outcome === 'keep' ? 'valid' : 'invalid', outcome },
    raw: outcome === 'keep' ? 'sign' : 'a long reply that wraps instead of pushing the table past the edge of a phone screen',
    latencyMs: 11_000 + index
  });
  const asked: string[] = [];

  // The dataset service answers at an address of its own (5010).
  await page.route(/^http:\/\/localhost:(4010|5001|5010)\//, async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3012',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(request.url());
    let data: unknown = [];
    if (url.pathname === '/api/trainings/judge/epochs') data = { training, epochs: [] };
    if (url.pathname === '/api/suites/zod-sam-verification/1') data = suite;
    if (url.pathname === '/api/datasets') data = { datasets: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } };
    if (url.pathname === '/api/trainings/judge/samples') {
      asked.push(url.search);
      const deleted = url.searchParams.get('fields')?.includes('delete');
      const samples = deleted ? [sample(2, 'delete')] : [sample(1, 'keep'), sample(2, 'delete')];
      data = { samples, pagination: { page: 1, limit: 25, total: deleted ? 27_285 : 145_432, pages: 1 } };
    }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/judge?tab=samples');
  await expect(page.getByRole('tab', { name: 'Samples' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('145,432 samples match')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'frame_000001/m1' })).toBeVisible();
  await expect(page.getByText('Image datasets could not be loaded')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'outcome' }).click();
  await page.getByRole('option', { name: 'delete' }).click();
  await expect(page.getByText('27,285 samples match')).toBeVisible();
  expect(asked.at(-1)).toContain('fields=%7B%22outcome%22%3A%22delete%22%7D');

  const scheme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.screenshot({ path: info.outputPath(`samples-${scheme}-desktop.png`), fullPage: true });
  const scan = await new AxeBuilder({ page }).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await expect(page.getByRole('listitem').filter({ hasText: 'frame_000002/m2' })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`samples-${scheme}-phone.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
