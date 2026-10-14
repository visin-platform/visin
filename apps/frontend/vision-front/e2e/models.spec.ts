import { expect, test, type Page } from '@playwright/test';

const digest = 'a'.repeat(64);
const training = {
  _id: 't1',
  uuid: 'run1',
  name: 'Iseauto CLFT',
  status: 'completed',
  createdAt: '2026-10-01T00:00:00Z'
};
const base = {
  provider: 'visin',
  kind: 'model',
  epoch: 99,
  addedAt: '2026-10-01T00:00:00Z',
  size: 2048,
  status: 'ready',
  license: { id: 'cc-by-4.0', name: 'CC BY 4.0' },
  credit: 'TalTech',
  modelInfo: { transforms: { resize: 384, image_mean: [0.485, 0.456, 0.406], image_std: [0.229, 0.224, 0.225] } }
};
const rows = [
  {
    training,
    model: { ...base, _id: 'pth', fileId: 'models/a.pth', filename: 'clft.pth', format: 'pth', sha256: digest }
  },
  {
    training,
    model: {
      ...base,
      _id: 'onnx',
      fileId: 'models/a.onnx',
      filename: 'clft.onnx',
      format: 'onnx',
      sha256: 'b'.repeat(64),
      sourceSha256: digest
    }
  },
  {
    training,
    model: {
      ...base,
      _id: 'pending',
      fileId: 'models/p.pth',
      filename: 'pending.pth',
      format: 'pth',
      status: 'verifying',
      sha256: undefined
    }
  },
  {
    training,
    model: {
      ...base,
      _id: 'unlicensed',
      fileId: 'models/u.pth',
      filename: 'unlicensed.pth',
      format: 'pth',
      sha256: 'c'.repeat(64),
      license: undefined
    }
  }
];

async function mockApi(page: Page) {
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
    if (pathname.endsWith('/models/pth/file')) {
      return route.fulfill({
        headers: { ...headers, 'content-disposition': 'attachment; filename="clft.pth"' },
        contentType: 'application/octet-stream',
        body: Buffer.from('test weights')
      });
    }
    const data =
      pathname === '/api/models' ? { models: rows, pagination: { page: 1, limit: 30, total: 3, pages: 1 } } : [];
    return route.fulfill({ headers, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
}

test.describe('stored model downloads', () => {
  test.beforeEach(async ({ page }) => mockApi(page));

  test('groups formats and delivers a checkpoint through one download URL', async ({ page }) => {
    const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/models');
    await page.goto('/models');
    await loaded;
    const weights = page.getByRole('link', { name: 'Download clft.pth (pth)', exact: true });
    const onnx = page.getByRole('link', { name: 'Download clft.onnx (onnx)', exact: true });
    await expect(weights).toBeVisible();
    await expect(onnx).toHaveAttribute('href', 'http://localhost:4010/api/trainings/t1/models/onnx/file');
    const row = page.getByRole('row').filter({ has: weights });
    await expect(row.getByRole('link', { name: 'Download clft.onnx (onnx)' })).toBeVisible();
    await expect(page.getByText(/camera mean 0.485/)).toHaveCount(0);
    await row.getByRole('button', { name: /^Show details/ }).click();
    await expect(page.getByText(/camera mean 0.485/)).toBeVisible();
    await expect(page.getByText(/Licence CC BY 4.0/)).toBeVisible();
    await expect(row.getByRole('link', { name: /Download the outputs/ })).toHaveAttribute(
      'href',
      /\/models\/pth\/bundle$/
    );
    const download = page.waitForEvent('download');
    await weights.click();
    expect((await download).suggestedFilename()).toBe('clft.pth');
    await expect(page.getByRole('link', { name: /Download pending/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Download unlicensed/ })).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Verifying model' })).toBeVisible();
  });

  test('keeps both downloads and preprocessing accessible on a phone', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 390, height: 844 });
    const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/models');
    await page.goto('/models');
    await loaded;
    await expect(page.getByRole('link', { name: 'Download clft.pth (pth)', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Download clft.onnx (onnx)', exact: true })).toBeVisible();
    await expect(page.getByText(/camera mean 0.485/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator('a a').count()).toBe(0);
    expect(errors).toEqual([]);
  });
});
