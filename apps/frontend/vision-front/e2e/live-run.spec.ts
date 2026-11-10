import { expect, test } from '@playwright/test';

/** A run that is training: each time the page asks, another epoch has finished, until the run completes. */
test('a run in progress updates itself, and stops asking once it is finished', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  let epochs = 3;
  let status: 'running' | 'completed' = 'running';
  let asked = 0;
  const epoch = (n: number) => ({
    _id: `e${n}`,
    trainingId: 't1',
    training_uuid: 'run1',
    epoch_uuid: `epoch-${n}`,
    epoch: n,
    timestamp: new Date(Date.UTC(2026, 10, 10, 10, n)).toISOString(),
    epoch_time: 34,
    results: {
      train: { loss: 1.1 * Math.exp(-n / 6) + 0.1, mean_iou: 0.3 + 0.03 * n },
      val: { loss: 1.2 * Math.exp(-n / 6) + 0.2, mean_iou: 0.28 + 0.03 * n }
    }
  });
  const training = () => ({
    _id: 't1',
    uuid: 'run1',
    name: 'night-run',
    status,
    createdAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    metrics: {
      totalTime: epochs * 34,
      epochCount: epochs,
      maxEpoch: epochs,
      lastEpochTimestamp: '2026-11-10T10:00:00Z',
      cpuCost: 0,
      gpuCost: 0,
      totalCost: 0
    }
  });

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
    if (pathname === '/api/trainings/t1/epochs') {
      asked++;
      data = { training: training(), epochs: Array.from({ length: epochs }, (_, i) => epoch(i + 1)) };
    }
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/t1');
  await expect(page.getByRole('heading', { name: 'night-run' }).first()).toBeVisible();
  await expect(page.getByText('running · epoch 3')).toBeVisible();
  await expect(page.getByText('about 34 s per epoch')).toBeVisible();
  await expect(page.getByTestId('live-dot')).toBeVisible();
  await page.screenshot({ path: info.outputPath('1-training.png') });

  // Another epoch finishes while the page is open: it follows, with no reload.
  epochs = 4;
  await expect(page.getByText('running · epoch 4')).toBeVisible({ timeout: 10_000 });

  // The run finishes: the live signs go, and the page stops asking.
  epochs = 5;
  status = 'completed';
  await expect(page.getByText('completed', { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('live-dot')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('2-completed.png') });
  const settled = asked;
  await page.waitForTimeout(9000);
  expect(asked).toBe(settled);
  expect(errors).toEqual([]);
});
