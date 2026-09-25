import { readFileSync } from 'fs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Every docs page, from the sitemap the site serves (a unit test holds it to
 * src/docs/pages.ts). Read from disk so tests can be generated per page.
 */
const DOCS_PATHS = [
  ...readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8').matchAll(
    /<loc>__LANDING_FRONT_URL__(\/docs[^<]*)<\/loc>/g
  )
]
  .map(([, path]) => path)
  .filter((path) => path !== '/docs/api');

test('reaches the quickstart from the landing page and copies its code', async ({ page, context }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Docs' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Integrate with Visin' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Docs' }).getByRole('link', { name: 'Quickstart' }).click();
  await expect(page).toHaveURL(/\/docs\/quickstart$/);
  await expect(page).toHaveTitle('Quickstart — Visin docs');

  const tabs = page.getByRole('tablist', { name: 'Code language' });
  await tabs.getByRole('tab', { name: 'curl' }).click();
  const frame = page.getByRole('tabpanel').locator('..');
  await frame.getByRole('button', { name: 'Copy code' }).click();
  await expect(frame.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('$VISIN_URL/api/epochs/upload');

  expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
});

test('reads on a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // The guides' tables and code must scroll inside their own box, never the page.
  expect(DOCS_PATHS.length).toBeGreaterThan(5);
  for (const path of DOCS_PATHS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways`).toBe(0);
  }

  await page.getByRole('button', { name: 'Docs menu' }).click();
  await page.getByRole('presentation').getByRole('link', { name: 'Quickstart' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Quickstart' })).toBeVisible();
});

test('renders both API references without calling anything but this site', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const { hostname } = new URL(request.url());
    // The page's own origin, and the Google Fonts every landing page already loads.
    if (!['localhost', '127.0.0.1'].includes(hostname) && !/(googleapis|gstatic)\.com$/.test(hostname)) {
      external.push(request.url());
    }
  });

  await page.goto('/docs/api');
  // The dev server compiles the reference (a 3 MB chunk) on its first request.
  await expect(page).toHaveTitle('API reference — Visin docs', { timeout: 60_000 });
  await expect(page.getByText('Create a new training').first()).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('button', { name: /Open Group - Epochs/ })
    .first()
    .click();
  await page.getByText('Upload epoch data from JSON').first().click();
  await expect(page.getByText('CreateEpochFromJsonBody').first()).toBeVisible();

  // The second document: API keys and OAuth, from auth-service.
  await page.getByRole('button', { name: /Runs and results/ }).click();
  await page.getByRole('option', { name: 'API keys and OAuth' }).click();
  await expect(page.getByText('Create an API key').first()).toBeVisible();

  expect(external, 'requests to other hosts').toEqual([]);
});

test("keeps the reference's styles off the landing page", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const scalarStyles = await page.evaluate(() =>
    [...document.querySelectorAll('style, link[rel="stylesheet"]')].some((node) =>
      (node.textContent || (node as HTMLLinkElement).href || '').includes('scalar')
    )
  );
  expect(scalarStyles).toBe(false);
});

// One test per page: an axe scan takes about two seconds, and the whole site
// in one test ran past Playwright's 30 s limit whenever the machine was busy.
for (const path of ['/', ...DOCS_PATHS]) {
  test(`has no serious accessibility problems on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const problems = violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} (${violation.nodes.length}) ${violation.nodes[0]?.target.join(' ')}`);
    expect(problems).toEqual([]);
  });
}
