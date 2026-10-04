import { expect, test, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * The home page's leaderboard section in a real browser, against an API faked in the page: with results, with
 * nothing published, and with the API down. It is the first thing a visitor to a deployment with results sees, so
 * it has to read well on a phone, stay legible, and never leave the page worse off when the API is not there.
 */

const BOARD = {
  metric: 'overall.mIoU_foreground', direction: 'max',
  entries: [
    { rank: 1, evaluationId: 'e1', run: { name: 'clftv2-base-fusion-epoch-152' }, project: { name: 'CLFTv2 (final)' }, dataset: 'ZOD test', epoch: 0, value: 0.5844, verified: false },
    { rank: 2, evaluationId: 'e2', checkpoint: { kind: 'local', label: 'mask2former-large-fusion-epoch-73' }, project: { name: 'CLFTv2 (final)' }, value: 0.5793, verified: true }
  ]
};

type Mode = 'results' | 'empty' | 'down';

async function mockApi(page: Page, mode: Mode) {
  await page.route(/^http:\/\/localhost:4010\//, async (route: Route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3000',
      'access-control-allow-headers': 'content-type'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (mode === 'down') return route.abort('connectionrefused');
    expect(new URL(request.url()).pathname).toBe('/api/evaluations/leaderboard');
    const filter = new URL(request.url()).searchParams.get('verification');
    const entries = mode === 'empty' ? [] : BOARD.entries.filter(row => filter === 'all' || row.verified === (filter === 'verified'));
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...BOARD, entries } }) });
  });
}

const SECTION = { name: 'See which model holds up' };

for (const mode of ['results', 'empty', 'down'] as const) {
  test(`${mode}: the section reads well, has no serious accessibility problems and fits a phone`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await mockApi(page, mode);
    await page.goto('/');

    const section = page.getByRole('region', SECTION);
    await expect(section).toBeVisible();
    if (mode === 'results') {
      await expect(section.getByRole('table')).toBeVisible();
      await expect(section.getByText('clftv2-base-fusion-epoch-152')).toBeVisible();
      await expect(section.getByText('0.5844')).toBeVisible();
      await expect(section.getByRole('img', { name: 'Not verified', exact: true })).toBeVisible();
      await expect(section.getByRole('img', { name: 'Verified', exact: true })).toBeVisible();
      await section.getByRole('combobox', { name: 'Verification' }).click();
      await page.getByRole('option', { name: 'Verified', exact: true }).click();
      await expect(section.getByText('clftv2-base-fusion-epoch-152')).toHaveCount(0);
      await section.getByRole('combobox', { name: 'Verification' }).click();
      await page.getByRole('option', { name: 'All', exact: true }).click();
      await expect(section.getByText('clftv2-base-fusion-epoch-152')).toBeVisible();
    } else if (mode === 'empty') {
      await expect(section.getByText('No recorded results match this filter.')).toBeVisible();
    } else {
      await expect(section.getByText('The leaderboard is not available right now')).toBeVisible();
    }
    await expect(section.getByText(/Loading the leaderboard/)).toHaveCount(0);

    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: testInfo.outputPath(`${mode}-desktop.png`) });

    const scan = await new AxeBuilder({ page }).include('#leaderboards').analyze();
    const serious = scan.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');
    expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    await section.scrollIntoViewIfNeeded();
    await section.screenshot({ path: testInfo.outputPath(`${mode}-phone.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);

    expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
  });
}
