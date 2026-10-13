import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * The editor with a real model server on this machine (`visin-infer`, its own
 * repository): connect from the Model dialog, get boxes suggested as the frame
 * opens, accept them, segment the bus with one click, and finish the frame —
 * then check what reached label-service.
 *
 * Visin's own API is simulated (as in label-flow.spec.ts); the model is not. It
 * runs only when one is up, so CI without a GPU skips it:
 *
 *   visin-infer serve --allow-origin http://localhost:3008        # in visin-inference
 *   VISIN_INFER_URL=http://localhost:8000 \
 *   VISIN_INFER_IMAGE=/path/to/ultralytics/assets/bus.jpg npm run test:e2e -- local-model
 */

const MODEL_URL = process.env.VISIN_INFER_URL;
const IMAGE = process.env.VISIN_INFER_IMAGE;

test.skip(!MODEL_URL || !IMAGE, 'needs a running visin-infer (VISIN_INFER_URL) and a test picture (VISIN_INFER_IMAGE)');

const user = { id: 'u1', email: 'worker@example.test', name: 'Worker' };

const job = {
  _id: 'j1',
  name: 'Buses',
  status: 'active',
  canLabel: true,
  taskType: 'annotate',
  redundancy: 1,
  tasksCount: 1,
  classes: [
    { key: 'bus', name: 'Bus', color: '#2a78d6', hotkey: '1', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'person', name: 'Person', color: '#eb6834', hotkey: '2', tools: ['box'], maskIndex: 2 },
    { key: 'road', name: 'Road', color: '#1baf7a', hotkey: '3', tools: ['mask'], maskIndex: 3 }
  ],
  sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
  progress: { tasks: 1, completed: 0, done: 0, skipped: 0, myDone: 0 }
};

// ultralytics' bus.jpg is 810×1080.
const FRAME = { width: 810, height: 1080 };
const FRAME_URL = 'https://files.example.test/frames/bus.jpg';

/** The mask the editor uploads, decoded: how many pixels carry each class index. */
const countMaskValues = (bytes: Buffer): { width: number; height: number; counts: Record<number, number> } => {
  const width = bytes.readUInt32LE(5);
  const height = bytes.readUInt32LE(9);
  const counts: Record<number, number> = {};
  for (let pos = 13; pos < bytes.length; ) {
    const value = bytes[pos++];
    let length = 0;
    let shift = 0;
    for (;;) {
      const byte = bytes[pos++];
      length += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    counts[value] = (counts[value] ?? 0) + length;
  }
  return { width, height, counts };
};

const simulateVisin = async (page: Page) => {
  const saved: { objects?: { classKey: string; source: string; score?: number }[]; mask?: Buffer; done: boolean } = { done: false };
  const image = readFileSync(IMAGE!);

  await page.route((url) => url.pathname.endsWith('/auth/verify'), (route) =>
    route.fulfill({ json: { success: true, authenticated: true, user } })
  );
  await page.route((url) => url.pathname.endsWith('/auth/profile'), (route) => route.fulfill({ json: { success: true, user } }));
  await page.route((url) => url.pathname.endsWith('/api/jobs'), (route) => route.fulfill({ json: { success: true, data: [job] } }));
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1'), (route) => route.fulfill({ json: { success: true, data: job } }));
  let served = false;
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/next'), (route) => {
    const data = served
      ? null
      : {
          task: { _id: 't1', jobId: 'j1', order: 0 },
          images: { frame: { url: FRAME_URL, ...FRAME, stem: 'bus' }, sensors: [] },
          position: { index: 0, total: 1 },
          annotation: { count: 0, mine: null, latest: null },
          suggestions: null
        };
    served = true;
    route.fulfill({ json: { success: true, data } });
  });
  // The frame, as file-service would serve it: readable cross-origin, for the model.
  await page.route(FRAME_URL, (route) =>
    route.fulfill({ body: image, contentType: 'image/jpeg', headers: { 'Access-Control-Allow-Origin': '*' } })
  );
  await page.route((url) => url.pathname.endsWith('/api/tasks/t1/annotation'), (route) => {
    saved.objects = (route.request().postDataJSON() as { objects: typeof saved.objects }).objects;
    route.fulfill({ json: { success: true, data: { status: 'draft', objects: saved.objects } } });
  });
  await page.route((url) => url.pathname.endsWith('/api/tasks/t1/annotation/mask'), (route) => {
    saved.mask = route.request().postDataBuffer() ?? undefined;
    route.fulfill({ json: { success: true, data: { status: 'draft', objects: [], mask: FRAME } } });
  });
  await page.route((url) => url.pathname.endsWith('/api/tasks/t1/annotation/done'), (route) => {
    saved.done = true;
    route.fulfill({ json: { success: true, data: { status: 'done', objects: [] } } });
  });
  return saved;
};

test('a model on this computer suggests boxes and segments with a click', async ({ page }) => {
  test.setTimeout(120_000);
  const saved = await simulateVisin(page);

  await page.goto('/jobs/j1/work');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  // Connect from the Model dialog, the way an annotator does.
  await page.getByRole('button', { name: 'model' }).click();
  await expect(page.getByTestId('model-command')).toContainText('--allow-origin http://localhost:3008');
  await page.getByLabel('Address').fill(MODEL_URL!);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText(/^Connected · .+ · detects 80 classes · click-to-segment on$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  // The open frame had nothing on it, so the model's boxes are suggested at once:
  // the bus and the people, and nothing for the 70-odd COCO classes the job lacks.
  await expect(page.getByTestId('suggestion-box').first()).toBeVisible({ timeout: 30_000 });
  const suggested = await page.getByTestId('suggestion-box').count();
  expect(suggested).toBeGreaterThanOrEqual(4);
  await expect(page.getByText(/suggested boxes/)).toBeVisible();

  // Accept them all.
  await page.keyboard.press('a');
  await expect(page.getByTestId('box')).toHaveCount(suggested);
  await expect(page.getByTestId('suggestion-box')).toHaveCount(0);
  await expect(page.locator('svg text').filter({ hasText: 'Bus' })).toHaveCount(1);

  // Segment the bus: pick its class, the segment tool, and click inside its box.
  await page.keyboard.press('1');
  await page.keyboard.press('s');
  await expect(page.getByText(/Click the object/)).toBeVisible();
  const boxes = await page.getByTestId('box').evaluateAll((rects) =>
    rects.map((rect) => {
      const bounds = rect.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
    })
  );
  // The bus is the widest box on the frame.
  const widest = boxes.reduce((best, box) => (box.w > best.w ? box : best));
  await page.mouse.click(widest.x + widest.w * 0.5, widest.y + widest.h * 0.35);
  await expect(page.getByTestId('sam-point')).toHaveCount(1);
  await expect(page.getByText(/Enter keeps this mask/)).toBeVisible({ timeout: 30_000 });

  // Keep the mask, then finish the frame.
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Click the object/)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText('All done')).toBeVisible({ timeout: 15_000 });

  // What label-service received before the frame was closed.
  expect(saved.done).toBe(true);
  const classes = (saved.objects ?? []).map((object) => object.classKey);
  expect(classes).toContain('bus');
  expect(classes.filter((key) => key === 'person').length).toBeGreaterThanOrEqual(3);
  expect(saved.objects!.every((object) => object.source === 'model' && (object.score ?? 0) > 0)).toBe(true);
  expect(saved.mask).toBeDefined();
  const mask = countMaskValues(saved.mask!);
  expect({ width: mask.width, height: mask.height }).toEqual(FRAME);
  // The bus is a large part of the picture: tens of thousands of pixels, all of class 1.
  expect(mask.counts[1]).toBeGreaterThan(100_000);
  expect(mask.counts[2] ?? 0).toBe(0);
});
