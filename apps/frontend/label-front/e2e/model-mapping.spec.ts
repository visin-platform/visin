import { test, expect } from '@playwright/test';

const MODEL_URL = 'http://127.0.0.1:18999';
const FRAME_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('a manager maps car to vehicle and person to human and sees the filtered detections', async ({ page }) => {
  const user = { id: 'u1', email: 'manager@example.test', name: 'Manager' };
  let job = {
    _id: 'j1', name: 'Labels', status: 'active', canLabel: true, canManage: true, taskType: 'annotate', redundancy: 1, tasksCount: 1,
    classes: [
      { key: 'human', name: 'Human', color: '#2a78d6', tools: ['box', 'mask'], maskIndex: 1 },
      { key: 'vehicle', name: 'Vehicle', color: '#eb6834', tools: ['box', 'mask'], maskIndex: 2 }
    ] as { key: string; name: string; color: string; tools: string[]; maskIndex: number; modelClass?: string }[],
    sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
    progress: { tasks: 1, completed: 0, done: 0, skipped: 0, myDone: 0 }
  };
  const mapped: Record<string, string | null>[] = [];
  await page.route((url) => url.pathname.endsWith('/auth/verify'), (route) => route.fulfill({ json: { success: true, authenticated: true, user } }));
  await page.route((url) => url.pathname.endsWith('/auth/profile'), (route) => route.fulfill({ json: { success: true, user } }));
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1'), (route) => route.fulfill({ json: { success: true, data: job } }));
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/model-mapping'), (route) => {
    const { mapping } = route.request().postDataJSON() as { mapping: Record<string, string | null> };
    mapped.push(mapping);
    job = { ...job, classes: job.classes.map((entry) => ({ ...entry, modelClass: mapping[entry.key] ?? undefined })) };
    return route.fulfill({ json: { success: true, data: job } });
  });
  let served = false;
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/next'), (route) => {
    const item = served ? null : {
      task: { _id: 't1', jobId: 'j1', order: 0 },
      images: { frame: { url: FRAME_URL, width: 400, height: 300, stem: 'frame' }, sensors: [] },
      position: { index: 0, total: 1 }, annotation: { count: 0, mine: null, latest: null }, suggestions: null
    };
    served = true;
    return route.fulfill({ json: { success: true, data: item } });
  });
  await page.route((url) => url.pathname.endsWith('/api/tasks/t1/annotation'), (route) => route.fulfill({ json: { success: true, data: { status: 'draft', objects: [] } } }));
  await page.route(`${MODEL_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': 'http://localhost:3008', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const info = { name: 'test-detector', version: '1', device: 'Test GPU', classes: ['person', 'car'], supports: { detect: true, segment: false } };
    const boxes = [
      { bbox: [10, 20, 90, 40], class: 'car', score: 0.9 },
      { bbox: [200, 40, 30, 90], class: 'person', score: 0.8 }
    ];
    return route.fulfill({ headers, json: route.request().url().endsWith('/info') ? info : { boxes } });
  });

  await page.goto('/jobs/j1/work');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.getByRole('button', { name: 'model' }).click();
  await page.getByLabel('Address').fill(MODEL_URL);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText(/Connected · Test GPU/)).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText(/detected 2 objects.*none match/)).toBeVisible();
  await expect(page.getByTestId('suggestion-box')).toHaveCount(0);

  await page.getByRole('button', { name: 'Class mappings', exact: true }).click();
  await page.getByLabel('Model class for Human').fill('person');
  await page.getByLabel('Model class for Vehicle').fill('car');
  await page.getByRole('button', { name: 'Save mappings' }).click();
  await expect(page.getByRole('dialog', { name: 'Model class mapping' })).toHaveCount(0);
  expect(mapped).toEqual([{ human: 'person', vehicle: 'car' }]);
  await expect(page.getByTestId('suggestion-box')).toHaveCount(2);
  await expect(page.getByText(/none match this job/)).toHaveCount(0);

  await page.keyboard.press('a');
  await expect(page.getByTestId('box')).toHaveCount(2);
  await expect(page.locator('svg text').filter({ hasText: 'Vehicle' })).toHaveCount(1);
  await expect(page.locator('svg text').filter({ hasText: 'Human' })).toHaveCount(1);
});
