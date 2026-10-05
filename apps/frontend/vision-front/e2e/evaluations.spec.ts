import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The evaluation pages in a real browser, against an API that is faked in the page.
 *
 * What these catch that the component tests cannot: a layout that overflows a phone, a colour pair too close to read
 * in either scheme, a page that throws when the shell renders it, and a table nobody can use with a keyboard.
 * The numbers are the shape of a real ZOD result: five weather conditions, a model that does well overall and
 * collapses in `snow`.
 */

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const CONDITIONS = [
  { name: 'day_fair', sampleCount: 356 },
  { name: 'day_rain', sampleCount: 59 },
  { name: 'night_fair', sampleCount: 97 },
  { name: 'night_rain', sampleCount: 26 },
  { name: 'snow', sampleCount: 41 }
];
const PROTOCOL = {
  task: 'semantic-segmentation',
  data: { kind: 'external', label: 'ZOD test splits', manifestSha256: 'a'.repeat(64) },
  split: 'test',
  conditions: CONDITIONS,
  classes: [],
  ignoredClasses: [],
  metrics: [
    { key: 'mIoU_foreground', direction: 'max', unit: 'ratio', range: { min: 0, max: 1 }, headline: true },
    { key: 'fw_iou', direction: 'max', range: { min: 0, max: 1 } }
  ],
  aggregation: 'equal-mean-of-conditions',
  input: { sensors: ['camera', 'lidar'] },
  evaluator: { package: 'visin-fusion', minVersion: '0.4.0' }
};
const SUITE = {
  _id: 's1',
  slug: 'zod-weather',
  version: 1,
  name: 'ZOD, five weather test sets',
  description: 'Held-out ZOD frames, scored per weather and light condition.',
  projectId: 'p1',
  visibility: 'public',
  createdBy: 'u1',
  digest: 'ab12cd34ef56'.repeat(5).slice(0, 64),
  protocol: PROTOCOL,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z'
};
const scoresFor = (base: number, snow: number) => ({
  conditions: {
    day_fair: { mIoU_foreground: base + 0.03, fw_iou: base + 0.08 },
    day_rain: { mIoU_foreground: base - 0.02, fw_iou: base + 0.04 },
    night_fair: { mIoU_foreground: base - 0.05, fw_iou: base + 0.01 },
    night_rain: { mIoU_foreground: base - 0.09, fw_iou: base - 0.02 },
    snow: { mIoU_foreground: snow, fw_iou: snow + 0.05 }
  },
  overall: { mIoU_foreground: base - 0.026 + snow / 5 - 0.0, fw_iou: base + 0.02 }
});
const ELIGIBLE = { version: 1, state: 'eligible', reasons: [], warnings: [], scores: scoresFor(0.62, 0) };
const INCOMPLETE = {
  version: 1,
  state: 'incomplete',
  reasons: [
    { code: 'missing-condition', detail: 'snow' },
    { code: 'missing-sample-count', detail: 'night_rain' }
  ],
  warnings: []
};
const LOCAL = (label: string) => ({ kind: 'local', sha256: 'c'.repeat(64), label });
const evaluation = (id: string, label: string, validation: object, extra: object = {}) => ({
  _id: id,
  uuid: `u-${id}`,
  projectId: 'p1',
  ownerId: 'u1',
  checkpoint: LOCAL(label),
  checkpointKey: `sha256:${'c'.repeat(64)}`,
  suite: { id: 's1', slug: 'zod-weather', version: 1, digest: SUITE.digest },
  status: 'completed',
  sampleCounts: { day_fair: 356, day_rain: 59, night_fair: 97, night_rain: 26, snow: 41 },
  executedAt: '2026-10-02T08:00:00.000Z',
  receivedAt: '2026-10-02T09:00:00.000Z',
  createdAt: '2026-10-02T09:00:00.000Z',
  validation,
  ...extra
});
const E1 = evaluation('e1', 'clftv2-base-fusion-epoch-152', ELIGIBLE, {
  source: { trainingId: 't1', epoch: 152 },
  results: { day_fair: { overall: { mIoU_foreground: 0.65 } } },
  provenance: { evaluator: { package: 'visin-fusion', version: '0.4.0', commit: '9d1c2ab' }, seeds: [42] }
});
const E2 = evaluation('e2', 'baseline-rgb-epoch-88', INCOMPLETE);
const E3 = evaluation('e3', 'acme/clftv2', ELIGIBLE, {
  checkpoint: { kind: 'hf', repo: 'acme/clftv2', commit: COMMIT, path: 'best.safetensors' },
  publishedAt: '2026-10-03T10:00:00.000Z'
});
const ENTRY = (rank: number, label: string, headline: number, worst: string, worstValue: number, id: string) => ({
  rank,
  evaluationId: id,
  uuid: `u-${id}`,
  checkpointKey: `sha256:${id}`,
  attempts: rank === 1 ? 3 : 1,
  checkpoint: LOCAL(label),
  project: { _id: 'p1', name: 'CLFTv2 (final)', slug: 'clftv2' },
  receivedAt: '2026-10-02T09:00:00.000Z',
  summary: {
    headline: { key: 'mIoU_foreground', value: headline, direction: 'max' },
    worst: { condition: worst, value: worstValue },
    gap: headline - worstValue
  }
});
const BOARD = {
  suite: {
    slug: 'zod-weather',
    version: 1,
    name: SUITE.name,
    digest: SUITE.digest,
    headline: { key: 'mIoU_foreground', direction: 'max', unit: 'ratio' }
  },
  selection: 'latest-eligible-completed',
  scope: { candidates: 6, truncated: false },
  pagination: { page: 1, limit: 100, total: 4, pages: 1 },
  unrankedPagination: { page: 1, limit: 100, total: 1, pages: 1 },
  entries: [
    ENTRY(1, 'clftv2-base-fusion-epoch-152', 0.5844, 'snow', 0, 'e1'),
    ENTRY(2, 'mask2former-large-fusion-epoch-73', 0.5793, 'night_rain', 0.4274, 'e4'),
    ENTRY(3, 'deeplabv3plus-rgb-epoch-86', 0.5727, 'snow', 0.2012, 'e5'),
    ENTRY(3, 'maskformer-base-fusion-epoch-103', 0.5727, 'snow', 0.2231, 'e6')
  ],
  unranked: [
    {
      evaluationId: 'e2',
      uuid: 'u-e2',
      checkpointKey: 'sha256:e2',
      checkpoint: LOCAL('baseline-rgb-epoch-88'),
      state: 'incomplete',
      attempts: 2,
      reasons: INCOMPLETE.reasons,
      receivedAt: '2026-10-02T09:00:00.000Z',
      project: { _id: 'p1', name: 'CLFTv2 (final)' }
    }
  ]
};
const PUBLIC_SUITE = {
  slug: 'zod-weather',
  version: 1,
  name: SUITE.name,
  description: SUITE.description,
  digest: SUITE.digest,
  task: 'semantic-segmentation',
  split: 'test',
  data: { kind: 'external', label: 'ZOD test splits' },
  // A licence that limits use, so the page is checked with its warning colour in both schemes.
  dataTerms: {
    license: { id: 'cc-by-nc-sa-4.0', name: 'CC BY-NC-SA 4.0', url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/', commercial: false },
    sourceUrl: 'https://zod.example.test/',
    credit: 'Zenseact, 2023'
  },
  conditions: CONDITIONS,
  headline: { key: 'mIoU_foreground', direction: 'max', unit: 'ratio' },
  aggregation: 'equal-mean-of-conditions',
  evaluator: { package: 'visin-fusion', minVersion: '0.4.0' }
};
const PUBLIC_BOARD = {
  suite: PUBLIC_SUITE,
  selection: 'latest-eligible-completed',
  scope: { candidates: 3 },
  pagination: { page: 1, limit: 100, total: 3, pages: 1 },
  evidence: 'submitter-reported',
  generatedAt: '2026-10-03T12:00:00.000Z',
  entries: BOARD.entries.slice(0, 3).map((entry) => ({
    rank: entry.rank,
    evaluationId: entry.evaluationId,
    checkpoint: entry.checkpoint,
    headline: entry.summary.headline.value,
    worst: entry.summary.worst,
    gap: entry.summary.gap,
    conditions: {
      day_fair: 0.65,
      day_rain: 0.6,
      night_fair: 0.57,
      night_rain: 0.5,
      snow: entry.summary.worst.condition === 'snow' ? entry.summary.worst.value : 0.45
    },
    attempts: entry.attempts,
    project: { name: 'CLFTv2 (final)', slug: 'clftv2' },
    publishedAt: '2026-10-03T10:00:00.000Z'
  }))
};

const page_ = <T>(key: string, items: T[]) => ({
  [key]: items,
  pagination: { page: 1, limit: 30, total: items.length, pages: 1 }
});

/** What each endpoint answers, by path. A path nobody mocked answers 404, like a missing record. */
function answer(pathname: string, params = new URLSearchParams()): { status?: number; body: unknown } {
  const path = pathname.replace(/^\/api/, '');
  const ok = (data: unknown) => ({ body: { success: true, data } });
  if (path === '/auth/verify')
    return {
      body: {
        success: true,
        authenticated: true,
        user: { id: 'u1', email: 'u1@example.test', name: 'Una Researcher', groupRoles: ['owner'] }
      }
    };
  if (path === '/suites')
    return ok(
      page_('suites', [
        SUITE,
        {
          ...SUITE,
          _id: 's2',
          version: 2,
          name: 'ZOD, five weather test sets, v2',
          visibility: 'private',
          archivedAt: '2026-10-02T00:00:00.000Z'
        }
      ])
    );
  if (path === '/suites/zod-weather/1') return ok(SUITE);
  if (path === '/suites/zod-weather/1/leaderboard') return ok(BOARD);
  if (path === '/evaluations/leaderboard') {
    const verification = params.get('verification') ?? 'all';
    const all = [
      { rank: 1, evaluationId: 'e1', checkpoint: LOCAL('clftv2-base-fusion-epoch-152'), project: { id: 'p1', name: 'Fusion' }, value: 0.74, verified: true, receivedAt: E1.receivedAt },
      { rank: 2, evaluationId: 'e2', run: { id: 'run', name: 'Migrated run' }, project: { id: 'p1', name: 'Fusion' }, epoch: 0, value: 0.70, verified: false, receivedAt: E2.receivedAt }
    ];
    const entries = all.filter(row => verification === 'all' || row.verified === (verification === 'verified'));
    return ok({ metric: 'overall.mIoU_foreground', metrics: ['overall.mIoU_foreground'], direction: 'max', verification, entries, pagination: { page: 1, limit: 100, total: entries.length, pages: 1 } });
  }
  if (path === '/evaluations') return ok(page_('evaluations', [E1, E2, E3]));
  if (path === '/evaluations/e1') return ok(E1);
  if (path === '/evaluations/e2') return ok(E2);
  if (path === '/evaluations/e3') return ok(E3);
  if (path === '/public/leaderboards')
    return ok({
      leaderboards: [{ ...PUBLIC_SUITE, checkpoints: 3, lastPublishedAt: '2026-10-03T10:00:00.000Z' }],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 }
    });
  if (path === '/public/leaderboards/zod-weather/1') return ok(PUBLIC_BOARD);
  if (path === '/public/evaluations/e1') {
    return ok({
      evaluationId: 'e1',
      suite: PUBLIC_SUITE,
      checkpoint: LOCAL('clftv2-base-fusion-epoch-152'),
      scores: scoresFor(0.62, 0),
      sampleCounts: E1.sampleCounts,
      evaluator: { package: 'visin-fusion', version: '0.4.0', commit: '9d1c2ab' },
      project: { name: 'CLFTv2 (final)' },
      evidence: 'submitter-reported',
      executedAt: '2026-10-02T08:00:00.000Z',
      publishedAt: '2026-10-03T10:00:00.000Z'
    });
  }
  return { status: 404, body: { success: false, message: 'Not found' } };
}

async function mockApi(page: Page, paged = false) {
  await page.route(/^http:\/\/localhost:(4010|5001)\//, async (route: Route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': request.headers().origin ?? 'http://localhost:3012',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(request.url());
    const { status = 200, body: defaultBody } = answer(url.pathname, url.searchParams);
    let body = defaultBody;
    if (paged && url.pathname.endsWith('/leaderboard')) {
      const selectedPage = Number(url.searchParams.get('page') ?? 1);
      const unrankedPage = Number(url.searchParams.get('unrankedPage') ?? 1);
      body = {
        success: true,
        data: {
          ...BOARD,
          entries: [{ ...BOARD.entries[0], rank: (selectedPage - 1) * 100 + 1 }],
          pagination: { page: selectedPage, limit: 100, total: 101, pages: 2 },
          unrankedPagination: { page: unrankedPage, limit: 100, total: 101, pages: 2 }
        }
      };
    } else if (paged && url.pathname === '/api/public/leaderboards/zod-weather/1') {
      const selectedPage = Number(url.searchParams.get('page') ?? 1);
      body = {
        success: true,
        data: {
          ...PUBLIC_BOARD,
          entries: [{ ...PUBLIC_BOARD.entries[0], rank: (selectedPage - 1) * 100 + 1 }],
          pagination: { page: selectedPage, limit: 100, total: 101, pages: 2 }
        }
      };
    }
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const PAGES: { path: string; heading: string | RegExp; name: string }[] = [
  { path: '/suites', heading: 'Suites', name: 'suites' },
  { path: '/suites/zod-weather/1', heading: SUITE.name, name: 'suite' },
  { path: '/suites/zod-weather/1/compare?a=e1&b=e3', heading: 'Compare two checkpoints', name: 'compare' },
  { path: '/evaluations', heading: 'Evaluations', name: 'evaluations' },
  { path: '/evaluations/e1', heading: 'clftv2-base-fusion-epoch-152', name: 'evaluation-ranked' },
  { path: '/evaluations/e2', heading: 'baseline-rgb-epoch-88', name: 'evaluation-unranked' },
  { path: '/leaderboards', heading: 'Leaderboards', name: 'leaderboards' },
  { path: '/leaderboards/zod-weather/1', heading: SUITE.name, name: 'leaderboard' },
  { path: '/leaderboards/zod-weather/1/e1', heading: 'clftv2-base-fusion-epoch-152', name: 'leaderboard-evidence' }
];

test.describe('evaluation pages', () => {
  test.beforeEach(async ({ page }) => mockApi(page));

  test('recorded leaderboard filters verified and migrated unverified results', async ({ page }) => {
    await page.goto('/leaderboards');
    const table = page.getByRole('table', { name: 'Recorded result leaderboard' });
    await expect(table.getByRole('link', { name: 'Migrated run' })).toBeVisible();
    await expect(table.getByRole('img', { name: 'Verified', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Verification', exact: true }).click();
    await page.getByRole('option', { name: 'Verified', exact: true }).click();
    await expect(table.getByRole('link', { name: 'Migrated run' })).toHaveCount(0);
    await expect(table.getByRole('img', { name: 'Verified', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Verification', exact: true }).click();
    await page.getByRole('option', { name: 'Not verified', exact: true }).click();
    await expect(table.getByRole('link', { name: 'Migrated run' })).toBeVisible();
    await expect(table.getByRole('img', { name: 'Verified', exact: true })).toHaveCount(0);
  });

  test('page navigation retains global ranks and independent page URLs after reload', async ({ page }, testInfo) => {
    await mockApi(page, true);
    await page.goto('/leaderboards/zod-weather/1');
    await page
      .getByRole('navigation', { name: 'Ranked model pages' })
      .getByRole('button', { name: 'Go to page 2' })
      .click();
    await expect(page).toHaveURL(/page=2/);
    await expect(
      page.getByRole('table', { name: 'Leaderboard' }).getByRole('cell', { name: '101', exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('table', { name: 'Leaderboard' }).getByRole('cell', { name: '101', exact: true })
    ).toBeVisible();

    await page.goto('/suites/zod-weather/1');
    await page
      .getByRole('navigation', { name: 'Ranked checkpoint pages', exact: true })
      .getByRole('button', { name: 'Go to page 2' })
      .click();
    await page
      .getByRole('navigation', { name: 'Unranked checkpoint pages' })
      .getByRole('button', { name: 'Go to page 2' })
      .click();
    await expect(page).toHaveURL(/page=2&unrankedPage=2/);
    await page.reload();
    await expect(
      page.getByRole('table', { name: 'Ranking' }).getByRole('cell', { name: '101', exact: true })
    ).toBeVisible();
    await expect(
      page
        .getByRole('navigation', { name: 'Unranked checkpoint pages' })
        .getByRole('button', { name: 'page 2', exact: true })
    ).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: testInfo.outputPath('pagination-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath('pagination-phone.png'), fullPage: true });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const scan = await new AxeBuilder({ page }).analyze();
    expect(
      scan.violations
        .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
        .map((violation) => violation.id)
    ).toEqual([]);
  });

  for (const { path, heading, name } of PAGES) {
    test(`${name}: renders, has no serious accessibility problems, and fits a phone`, async ({ page }, testInfo) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.getByRole('progressbar')).toHaveCount(0);

      const scheme = testInfo.project.name.endsWith('dark') ? 'dark' : 'light';
      await page.screenshot({ path: testInfo.outputPath(`${name}-${scheme}-desktop.png`), fullPage: true });

      const scan = await new AxeBuilder({ page }).analyze();
      const serious = scan.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical'
      );
      expect(serious.map((violation) => `${violation.id}: ${violation.nodes[0]?.target}`)).toEqual([]);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${scheme}-phone.png`), fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, 'the page scrolls sideways on a phone').toBeLessThanOrEqual(1);

      expect(pageErrors, `Uncaught exceptions: ${pageErrors.join(', ')}`).toEqual([]);
    });
  }
});
