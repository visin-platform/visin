import { expect, test } from '@playwright/test';

/** A run that overfits: validation loss bottoms out at epoch 8 and climbs after, and the chart says so. */
test('a run chart marks the best epoch and shades what came after it', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The second metric peaks late, so its label would run off the right edge of the chart.
  const epoch = (n: number) => ({
    _id: `e${n}`,
    trainingId: 't1',
    training_uuid: 'run1',
    epoch_uuid: `epoch-${n}`,
    epoch: n,
    timestamp: new Date(Date.UTC(2026, 10, 10, 10, n)).toISOString(),
    epoch_time: 34,
    results: {
      train: { loss: 1.1 * Math.exp(-n / 5) + 0.05, mean_iou: 0.3 + 0.02 * n },
      val: { loss: 0.3 + 0.01 * (n - 8) ** 2, mean_iou: 0.25 + 0.02 * Math.min(n, 19) }
    }
  });
  const training = {
    _id: 't1',
    uuid: 'run1',
    name: 'overfit-run',
    status: 'completed',
    createdAt: '2026-11-10T09:00:00Z',
    updatedAt: '2026-11-10T10:00:00Z',
    metrics: { totalTime: 20 * 34, epochCount: 20, maxEpoch: 20, lastEpochTimestamp: '2026-11-10T10:00:00Z' }
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
    const data =
      pathname === '/api/trainings/t1/epochs'
        ? { training, epochs: Array.from({ length: 20 }, (_, i) => epoch(i + 1)) }
        : [];
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });

  await page.goto('/trainings/t1');
  await expect(page.getByText(/Best validation Loss 0\.3 at epoch 8/)).toBeVisible();
  await expect(page.getByText(/ended at 1\.74 \(epoch 20\)/)).toBeVisible();
  const marker = page.getByTestId('best-epoch-marker').first();
  await expect(marker).toBeVisible();
  await expect(marker.getByText('best 0.3 @ 8')).toBeVisible();
  await expect(marker.locator('rect')).toHaveCount(1);
  await expect(page.getByTestId('best-epoch-marker')).toHaveCount(2);
  await page.getByTestId('best-epoch-marker').nth(1).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // the lines draw in
  await page.screenshot({ path: info.outputPath('best-epoch.png') });
  expect(errors).toEqual([]);
});
