import { test, expect } from '@playwright/test';

/**
 * Sign-in → open job → draw a box → Done → next frames → finished.
 * Backends are simulated with route interception (real sign-in needs Google),
 * so this exercises the real UI: routing, auth gating, the work queue, drawing,
 * autosave ahead of Done, and progress accounting.
 */

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const user = { id: 'u1', email: 'worker@x.com', name: 'Worker' };

const job = {
  _id: 'j1',
  name: 'Street scenes',
  status: 'active',
  // Job detail tells a group member they may label; without it the editor
  // opens read-only in browse mode and never pulls work.
  canLabel: true,
  taskType: 'annotate',
  redundancy: 1,
  tasksCount: 3,
  classes: [
    { key: 'car', name: 'Car', color: '#2a78d6', hotkey: '1', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'road', name: 'Road', color: '#eb6834', hotkey: '2', tools: ['mask'], maskIndex: 2 }
  ],
  sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
  progress: { tasks: 3, completed: 0, done: 0, skipped: 0, myDone: 0 }
};

// Must satisfy the whole WorkItem shape, not just the parts the assertions read:
// the editor dereferences `annotation` without a guard, so an item missing it
// throws and React unmounts the tree to a blank page — which surfaces as the next
// locator timing out rather than as an error.
const workItem = (id: string) => ({
  task: { _id: id, jobId: 'j1', order: Number(id.slice(1)) - 1 },
  images: { frame: { url: PNG_1PX, width: 400, height: 300, stem: `frame_${id}` }, sensors: [] },
  position: { index: Number(id.slice(1)) - 1, total: 3 },
  annotation: { count: 0, mine: null, latest: null },
  suggestions: null
});

test('sign-in → open job → draw a box → done → all frames finished', async ({ page }) => {
  const finished: string[] = [];
  const saved: Record<string, unknown[]> = {};

  await page.route((url) => url.pathname.endsWith('/auth/verify'), (route) =>
    route.fulfill({ json: { success: true, authenticated: true, user } })
  );
  await page.route((url) => url.pathname.endsWith('/auth/profile'), (route) =>
    route.fulfill({ json: { success: true, user } })
  );
  await page.route((url) => url.pathname.endsWith('/api/jobs'), (route) =>
    route.fulfill({ json: { success: true, data: [job] } })
  );
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1'), (route) =>
    route.fulfill({ json: { success: true, data: job } })
  );
  // Emulate the real lease semantics: `next` serves the first frame the user
  // hasn't finished and isn't already holding (excludeTaskIds).
  const pool = ['t1', 't2', 't3'];
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/next'), (route) => {
    const body = route.request().postDataJSON() as { excludeTaskIds?: string[] } | null;
    const excluded = new Set(body?.excludeTaskIds || []);
    const id = pool.find((task) => !finished.includes(task) && !excluded.has(task)) ?? null;
    route.fulfill({ json: { success: true, data: id ? workItem(id) : null } });
  });
  await page.route((url) => /\/api\/tasks\/[^/]+\/annotation$/.test(url.pathname), (route) => {
    const id = route.request().url().match(/\/api\/tasks\/([^/]+)\/annotation$/)![1];
    saved[id] = (route.request().postDataJSON() as { objects: unknown[] }).objects;
    route.fulfill({ json: { success: true, data: { status: 'draft', objects: saved[id] } } });
  });
  await page.route((url) => /\/api\/tasks\/[^/]+\/annotation\/done$/.test(url.pathname), (route) => {
    finished.push(route.request().url().match(/\/api\/tasks\/([^/]+)\/annotation\/done$/)![1]);
    route.fulfill({ json: { success: true, data: { status: 'done', objects: [] } } });
  });

  // Signed-in user lands on the jobs list.
  await page.goto('/');
  await expect(page.getByText('Street scenes')).toBeVisible();

  // Open the editor: the first frame is already on screen.
  await page.getByRole('link', { name: 'Start labeling' }).click();
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await expect(page.getByText('0/3')).toBeVisible();

  // Draw a box on the first frame, and finish it from the keyboard.
  const canvas = page.getByTestId('editor-canvas');
  const bounds = (await canvas.boundingBox())!;
  // The frame is fitted and centred, so draw around the middle of the surface.
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  await page.mouse.move(centerX - 80, centerY - 50);
  await page.mouse.down();
  await page.mouse.move(centerX + 80, centerY + 50, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('box')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByText('1/3')).toBeVisible();

  // Frames with nothing on them are finished the same way.
  await page.getByRole('button', { name: /Done/ }).click();
  await expect(page.getByText('2/3')).toBeVisible();
  await page.getByRole('button', { name: /Done/ }).click();

  // Queue exhausted → done screen with the session total.
  await expect(page.getByText('All done')).toBeVisible();
  await expect(page.getByText(/You finished 3 this session/)).toBeVisible();
  expect(finished).toEqual(['t1', 't2', 't3']); // three distinct frames, in order
  // The box went to the server before its frame was closed.
  expect(saved.t1).toHaveLength(1);
  expect(saved.t1[0]).toMatchObject({ classKey: 'car', source: 'human' });
});
