import { expect, test } from '@playwright/test';

/** A tiny but real one-page PDF, so the browser is handed what the API really sends. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF\n'
);

test('a paper with a PDF shows it in the page beside its abstract and results', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let state: 'pending' | 'ready' = 'pending';
  let asked = 0;
  const paper = {
    id: 'pa1',
    title: 'CLFTv2: camera-LiDAR fusion for segmentation',
    abstract: 'We fuse camera and LiDAR in one transformer and compare it with CLFT, MaskFormer and Mask2Former.',
    authors: [{ name: 'Ann Lee' }, { name: 'Bo Wu' }],
    venue: 'IEEE',
    year: 2026,
    arxivId: '2601.00001',
    pdfUrl: 'https://papers.example.test/clftv2.pdf',
    tags: ['fusion'],
    owner: { kind: 'user', id: 'u1', name: 'Ann Lee' },
    visibility: 'public',
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    results: [
      {
        kind: 'training',
        available: true,
        ref: 't1',
        name: 'iSeAuto fusion CLFTv2-Base',
        note: 'Table 2',
        project: { id: 'p1', name: 'IseAuto trainings' }
      }
    ],
    permissions: { read: true, contribute: false, manage: false, own: false }
  };
  await page.route(/^http:\/\/localhost:(4010|5001)\//, async (route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3012',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const { pathname } = new URL(request.url());
    if (pathname === '/api/papers/pa1/pdf')
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/pdf', body: PDF });
    let data: unknown = [];
    if (pathname === '/api/papers/pa1') data = paper;
    else if (pathname === '/api/papers/pa1/document') {
      // Being read for the first couple of asks, then ready.
      if (++asked >= 3) state = 'ready';
      data =
        state === 'ready' ? { status: 'ready', viewable: true, pageCount: 14 } : { status: 'pending', viewable: false };
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data })
    });
  });

  await page.goto('/papers/pa1');
  await expect(page.getByRole('heading', { level: 1, name: paper.title })).toBeVisible();
  // While it is read, the page says so and keeps its details readable.
  await expect(page.getByRole('status', { name: 'Reading the paper’s PDF' })).toBeVisible();
  await expect(page.getByText(/We fuse camera and LiDAR/)).toBeVisible();

  const frame = page.getByTitle(`PDF of ${paper.title}`);
  await expect(frame).toBeVisible({ timeout: 15_000 });
  await expect(frame).toHaveAttribute('src', /^blob:.*#view=FitH$/);
  await expect(page.getByText('14 pages')).toBeVisible();
  await expect(page.getByRole('link', { name: 'iSeAuto fusion CLFTv2-Base' })).toBeVisible();

  // On a wide screen the PDF and the details sit side by side; the reader is the larger part.
  const [pdf, abstract] = await Promise.all([
    frame.boundingBox(),
    page.getByText(/We fuse camera and LiDAR/).boundingBox()
  ]);
  if ((page.viewportSize()?.width ?? 0) >= 1280) {
    expect(abstract!.x).toBeGreaterThan(pdf!.x + pdf!.width - 1);
    expect(pdf!.width).toBeGreaterThan(abstract!.width);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('paper-reader.png') });
  expect(errors).toEqual([]);
});
