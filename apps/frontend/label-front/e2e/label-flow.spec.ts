import { test, expect } from '@playwright/test';

/**
 * The Phase 3 e2e: sign-in → open job → label 3 tasks → progress reflects it.
 * Backends are simulated with route interception (real sign-in needs Google),
 * so this exercises the real UI: routing, auth gating, the work queue,
 * hotcuts/buttons, and progress accounting.
 */

const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const user = { id: 'u1', email: 'worker@x.com', name: 'Worker' };

const job = {
  _id: 'j1',
  name: 'Frame quality',
  status: 'active',
  // Job detail tells a group member they may label; without it the workbench
  // opens read-only in browse mode and never pulls work.
  canLabel: true,
  taskType: 'single_choice',
  redundancy: 1,
  tasksCount: 3,
  annotationSets: [],
  question: {
    prompt: 'Good frame?',
    choices: [
      { key: 'good', label: 'Good', hotkey: 'g' },
      { key: 'bad', label: 'Bad', hotkey: 'b' }
    ]
  },
  progress: { tasks: 3, completed: 0, answers: 0, myAnswers: 0 }
};

// Must satisfy the whole WorkItem shape, not just the parts the assertions read:
// the workbench dereferences `answer` without a guard (`currentItem?.answer.mine`),
// so an item missing it throws and React unmounts the tree to a blank page —
// which surfaces as the next locator timing out rather than as an error.
const workItem = (id: string) => ({
  task: { _id: id, jobId: 'j1', labelImageId: `img-${id}`, order: 0 },
  images: { frame: { url: PNG_1PX, width: 1, height: 1 }, layers: [] },
  position: { index: Number(id.slice(1)) - 1, total: 3 },
  answer: { count: 0, mine: null, latest: null }
});

test('sign-in → open job → label 3 tasks → progress reflects it', async ({ page }) => {
  const answeredTasks: string[] = [];

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
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/stats'), (route) =>
    route.fulfill({ json: { success: true, data: { tasks: 3, completed: 0, answers: 0, perUser: [], perStratum: [], agreement: null } } })
  );
  // Emulate the real lease semantics: `next` serves the first task the user
  // hasn't answered and isn't already holding (excludeTaskIds), and re-serves
  // held tasks otherwise — exactly what the backend's lease-resume does.
  const pool = ['t1', 't2', 't3'];
  await page.route((url) => url.pathname.endsWith('/api/jobs/j1/next'), (route) => {
    const body = route.request().postDataJSON() as { excludeTaskIds?: string[] } | null;
    const excluded = new Set(body?.excludeTaskIds || []);
    const id = pool.find((task) => !answeredTasks.includes(task) && !excluded.has(task)) ?? null;
    route.fulfill({ json: { success: true, data: id ? workItem(id) : null } });
  });
  await page.route((url) => /\/api\/tasks\/[^/]+\/answer$/.test(url.pathname), (route) => {
    const id = route.request().url().match(/\/api\/tasks\/([^/]+)\/answer$/)![1];
    answeredTasks.push(id);
    route.fulfill({ status: 201, json: { success: true, data: { _id: 'a' } } });
  });

  // Signed-in user lands on the jobs list.
  await page.goto('/');
  await expect(page.getByText('Frame quality')).toBeVisible();

  // Open the workbench.
  await page.getByRole('link', { name: 'Start labeling' }).click();
  await expect(page.getByText('Good frame?')).toBeVisible();
  await expect(page.getByText('0/3 · session 0')).toBeVisible();

  // Label 3 tasks; the header progress tracks each answer.
  await page.getByRole('button', { name: 'Good (g)' }).click();
  await expect(page.getByText('1/3 · session 1')).toBeVisible();

  await page.getByRole('button', { name: 'Bad (b)' }).click();
  await expect(page.getByText('2/3 · session 2')).toBeVisible();

  await page.getByRole('button', { name: 'Good (g)' }).click();

  // Queue exhausted → done screen with the session total.
  await expect(page.getByText('All done')).toBeVisible();
  await expect(page.getByText(/You answered 3 this session/)).toBeVisible();
  expect(answeredTasks).toEqual(['t1', 't2', 't3']); // three distinct tasks, in order
});
