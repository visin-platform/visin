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

/** The run's progress as a paged table of what each point reported, and its decisions measured against the annotator. */
test('an inference run pages its progress points and audits its decisions against the annotator', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const training = {
    _id: 'judge', uuid: 'qwen-v2', name: 'qwen2.5vl_72b_v2', kind: 'inference', status: 'completed',
    suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) },
    progress: { done: 4110, total: 4110, unit: 'frame' },
    createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T03:00:00Z',
    metrics: { totalTime: 0, epochCount: 0, maxEpoch: 0, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
  };
  const epochs = Array.from({ length: 4110 }, (_, index) => ({
    _id: `p${index}`, trainingId: 'judge', training_uuid: 'qwen-v2', epoch_uuid: `e${index}`, epoch: index + 1,
    timestamp: new Date(Date.UTC(2026, 7, 4) + index * 90_000).toISOString(),
    results: { reject_rate: { cyclist: 0.34, pedestrian: 0.35, sign: 0.11, vehicle: 0.18 }, latency_ms: 11_000, degenerate_rate: 0.018, frame_seconds: 88.4, vlm_calls: 58 },
    metadata: { frame: `frame_${String(index).padStart(6, '0')}` }
  }));
  const group = (groupBy: string, value: string | undefined, count: number, agreement: number) => ({
    groupBy, ...(value ? { value } : {}), count, agreement, divergence: 1 - agreement, kappa: 0.4, binaryKappa: 0.41, weightedDivergence: null,
    matrix: [{ a: 'keep', b: 'keep', count: 26_000, weight: 0 }, { a: 'keep', b: 'delete', count: 5_400, weight: 0 }, { a: 'delete', b: 'keep', count: 2_400, weight: 0 }, { a: 'delete', b: 'delete', count: 2_184, weight: 0 }]
  });
  const model = { _id: 'm1', status: 'completed', samplesDigest: 'a'.repeat(64), suite: { id: 's1', slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) },
    checkpoint: { kind: 'local', label: 'qwen2.5vl:72b (Q4_K_M)', sha256: 'b'.repeat(64) },
    results: { overall: { overall: {}, sign: { false_accept: 0.512, false_reject: 0.241 }, vehicle: { false_accept: 0.4, false_reject: 0.2 } } } };
  const human = { _id: 'h1', status: 'completed', samplesDigest: 'c'.repeat(64), checkpoint: { kind: 'human', label: 'annotator_1' } };
  const pair = { evaluationA: 'm1', evaluationB: 'h1', suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) }, referenceEvaluationId: 'h1',
    fields: ['outcome', 'verdict', 'decision'].map((field) => ({ field, groups: [group('overall', undefined, 35_984, 0.78), group('class', 'sign', 9_000, 0.8), group('class', 'vehicle', 20_000, 0.82), group('size', '<250', 12_000, 0.7)] })) };
  const suite = { _id: 's1', slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64),
    protocol: { classes: [{ id: 'sign' }, { id: 'vehicle' }], conditions: [{ name: '<250', sampleCount: 1 }], metrics: [],
      samples: { attrs: [{ key: 'class', values: ['sign', 'vehicle'] }], fields: [{ key: 'outcome', values: ['keep', 'delete'] }, { key: 'verdict', values: ['valid', 'invalid'] }, { key: 'decision', values: ['accept', 'reject'] }] } } };

  await page.route(/^http:\/\/localhost:(4010|5001|5010)\//, async (route) => {
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
    if (pathname === '/api/trainings/judge/epochs') data = { training, epochs };
    if (pathname === '/api/evaluations') data = { evaluations: [model], pagination: { page: 1, limit: 20, total: 1, pages: 1 } };
    if (pathname === '/api/evaluations/m1/reference') data = human;
    if (pathname === '/api/evaluations/m1/compare/h1') data = pair;
    if (pathname === '/api/suites/zod-sam-verification/1') data = suite;
    if (pathname === '/api/datasets') data = { datasets: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } };
    if (pathname === '/api/evaluations/m1/disagreements/h1') {
      data = { field: 'outcome', samples: [{ id: 'frame_000012/m1', attrs: { frame: 'frame_000012', class: 'sign' }, a: { fields: { outcome: 'keep' }, raw: 'sign' }, b: { fields: { outcome: 'delete' } } }], pagination: { page: 1, limit: 10, total: 5400, pages: 540 } };
    }
    if (pathname === '/api/benchmarks') data = { benchmarks: [], pagination: { page: 1, limit: 1, total: 0, pages: 0 } };
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/judge?tab=epochs');
  const progress = page.getByRole('table', { name: 'Progress points' });
  await expect(progress).toBeVisible();
  await expect(progress.getByRole('row')).toHaveCount(51);
  await expect(progress.getByRole('row').nth(1)).toContainText('frame_000000');
  await expect(page.getByRole('button', { name: /upload epochs/i })).toHaveCount(0);
  // Nothing for these: the tabs are left out rather than shown empty.
  await expect(page.getByRole('tab', { name: 'System Info' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Benchmarks' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Audit' }).click();
  await expect(page.getByText("35,984 of this run's decisions were audited by annotator_1.")).toBeVisible();
  await page.getByRole('button', { name: '5,400 decisions: model keep, annotator delete' }).click();
  await expect(page.getByText('5,400 matching samples')).toBeVisible();

  const scheme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.screenshot({ path: info.outputPath(`audit-${scheme}-desktop.png`), fullPage: true });
  // Scanned from the top: the navigation bar is translucent, so its contrast depends on what is scrolled under it
  // (a separate, known issue of the shared layout), not on this page.
  await page.evaluate(() => window.scrollTo(0, 0));
  const scan = await new AxeBuilder({ page }).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: info.outputPath(`audit-${scheme}-phone.png`), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

/** One overlay per frame lays out side by side, pages from the server, and is found by frame name on any page. */
test('an inference run shows its per-frame overlays side by side, a page at a time', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const training = {
    _id: 'judge', uuid: 'qwen-v2', name: 'qwen2.5vl_72b_v2', kind: 'inference', status: 'completed',
    suite: { slug: 'zod-sam-verification', version: 1, digest: 'd'.repeat(64) }, progress: { done: 4110, total: 4110, unit: 'frame' },
    createdAt: '2026-11-18T00:00:00Z', updatedAt: '2026-11-18T03:00:00Z',
    metrics: { totalTime: 0, epochCount: 0, maxEpoch: 0, lastEpochTimestamp: null, cpuCost: 0, gpuCost: 0, totalCost: 0 }
  };
  const epochs = Array.from({ length: 300 }, (_, index) => ({
    _id: `p${index}`, trainingId: 'judge', training_uuid: 'qwen-v2', epoch_uuid: `e${index}`, epoch: index + 1,
    timestamp: new Date(Date.UTC(2026, 7, 4) + index * 90_000).toISOString(), results: { latency_ms: 11_000 }
  }));
  const image = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1363" height="768"><rect width="1363" height="768" fill="gray"/></svg>');
  const overlay = (epoch: number) => ({
    _id: `v${epoch}`, visualization_uuid: `viz-${epoch}`, epoch_uuid: `e${epoch - 1}`, epoch, type: 'triage',
    filename: `frame_${String(epoch * 7).padStart(6, '0')}.jpg`, signedUrl: image, uploadedAt: '2026-11-18T20:56:00Z'
  });
  const asked: URLSearchParams[] = [];
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
    if (url.pathname === '/api/trainings/judge/epochs') data = { training, epochs };
    if (url.pathname === '/api/visualizations/types') data = { types: ['triage'] };
    if (url.pathname === '/api/benchmarks') data = { benchmarks: [], pagination: { page: 1, limit: 1, total: 0, pages: 0 } };
    if (url.pathname === '/api/visualizations/training/qwen-v2') {
      asked.push(url.searchParams);
      const search = url.searchParams.get('search');
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      const visualizations = search ? [overlay(12)] : Array.from({ length: 24 }, (_, index) => overlay(4110 - (pageNumber - 1) * 24 - index));
      const total = search ? 1 : 4110;
      data = { visualizations, total, pagination: { page: pageNumber, limit: 24, total, pages: Math.ceil(total / 24) } };
    }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/judge?tab=visualizations');
  await expect(page.getByText('4,110 images')).toBeVisible();
  await expect(page.getByText('Frames done 4,110 ·')).toBeVisible();
  // Side by side: the first two images share a row.
  const cards = page.locator('img[alt^="frame_"]');
  await expect(cards.first()).toBeVisible();
  const [first, second] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
  expect(Math.abs((first?.y ?? 0) - (second?.y ?? 1))).toBeLessThan(2);
  await page.getByRole('button', { name: 'Go to page 2' }).click();
  await expect(page.getByText('Frames done 4,086 ·')).toBeVisible();
  await page.getByLabel('Search by Name').fill('frame_000084');
  await expect(page.getByText('frame_000084.jpg')).toBeVisible();
  expect(asked.at(-1)?.get('search')).toBe('frame_000084');
  expect(asked.at(-1)?.get('page')).toBe('1');
  // 300 points: typed, not listed.
  await expect(page.getByRole('spinbutton', { name: 'Frames done' })).toBeVisible();

  const scheme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  await page.getByLabel('Search by Name').fill('');
  await expect(page.getByText('4,110 images')).toBeVisible();
  await page.screenshot({ path: info.outputPath(`overlays-${scheme}-desktop.png`), fullPage: true });
  const scan = await new AxeBuilder({ page }).analyze();
  const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
  expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);
  expect(errors).toEqual([]);
});
