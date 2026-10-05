import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';

const recorded = vi.hoisted(() => ({ leaderboard: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
const service = vi.hoisted(() => ({ listPage: vi.fn(), list: vi.fn(), get: vi.fn(), evaluation: vi.fn() }));
vi.mock('../services/evaluationService', () => ({ publicLeaderboardService: service, evaluationService: recorded }));

import PublicEvaluationPage from './PublicEvaluationPage';
import PublicLeaderboardPage from './PublicLeaderboardPage';
import PublicLeaderboardsPage from './PublicLeaderboardsPage';
import { renderWithClient } from '../test/renderWithClient';
import type { PublicEvaluation, PublicLeaderboard, PublicSuite } from '../types/evaluation';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const suite = (overrides: Partial<PublicSuite> = {}): PublicSuite => ({
  slug: 'road-test',
  version: 1,
  name: 'Road scenes',
  digest: 'ab'.repeat(32),
  task: 'semantic-segmentation',
  split: 'test',
  data: { kind: 'external', label: 'Road test frames' },
  conditions: [{ name: 'day', sampleCount: 120 }, { name: 'night', sampleCount: 100 }],
  headline: { key: 'mIoU_foreground', direction: 'max', unit: 'ratio' },
  aggregation: 'equal-mean-of-conditions',
  evaluator: { package: 'visin-fusion', minVersion: '1.0.0' },
  ...overrides
});

const board = (overrides: Partial<PublicLeaderboard> = {}): PublicLeaderboard => ({
  suite: suite(),
  selection: 'latest-eligible-completed',
  scope: { candidates: 2 },
  pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  evidence: 'submitter-reported',
  generatedAt: '2026-10-03T12:00:00.000Z',
  entries: [
    {
      rank: 1, evaluationId: 'e1', attempts: 1, evidenceLevel: 'observed', publishedAt: '2026-10-02T09:00:00.000Z', headline: 0.74,
      checkpoint: { kind: 'local', label: 'Model B', sha256: 'a'.repeat(64) },
      worst: { condition: 'night', value: 0.7 }, gap: 0.04, conditions: { day: 0.78, night: 0.7 }, project: { name: 'Road team' }
    },
    {
      rank: 2, evaluationId: 'e2', attempts: 2, evidenceLevel: 'attested', publishedAt: '2026-10-01T09:00:00.000Z', headline: 0.7,
      checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT },
      worst: { condition: 'night', value: 0.6 }, gap: 0.1, conditions: { day: 0.8 }
    }
  ],
  ...overrides
});

describe('PublicLeaderboardsPage', () => {
  beforeEach(() => { vi.resetAllMocks(); recorded.leaderboard.mockResolvedValue({ metrics: [], entries: [], direction: 'max', verification: 'all', pagination: { page: 1, limit: 100, total: 0, pages: 0 } }); });

  it('lists the leaderboards that have something published, each leading to its page', async () => {
    service.listPage.mockResolvedValue({ leaderboards: [{ ...suite(), checkpoints: 3, lastPublishedAt: '2026-10-02T09:00:00.000Z' }], pagination: { page: 1, limit: 100, total: 1, pages: 1 } });
    renderWithClient(<PublicLeaderboardsPage />);
    expect(await screen.findByRole('link', { name: 'Road scenes' })).toHaveAttribute('href', '/leaderboards/road-test/1');
    expect(screen.getByText('semantic-segmentation')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(document.title).toContain('Leaderboards');
  });

  it('navigates discovery pages and requests the chosen page', async () => {
    service.listPage.mockImplementation(async ({ page }) => ({
      leaderboards: [{ ...suite(), name: `Suite page ${page}`, checkpoints: 3 }],
      pagination: { page, limit: 100, total: 101, pages: 2 }
    }));
    renderWithClient(<PublicLeaderboardsPage />);
    await screen.findByRole('link', { name: 'Suite page 1' });
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(await screen.findByRole('link', { name: 'Suite page 2' })).toBeInTheDocument();
    expect(service.listPage).toHaveBeenLastCalledWith({ page: 2 });
  });

  it('lets an empty out-of-range discovery page navigate back', async () => {
    service.listPage.mockResolvedValue({ leaderboards: [], pagination: { page: 3, limit: 100, total: 101, pages: 2 } });
    renderWithClient(<PublicLeaderboardsPage />, { path: '/?page=3' });
    expect(await screen.findByText('No leaderboards on this page')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
  });

  it('says plainly that nothing is published, rather than showing an empty table', async () => {
    service.listPage.mockResolvedValue({ leaderboards: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } });
    renderWithClient(<PublicLeaderboardsPage />);
    expect(await screen.findByText('No published results yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows why it failed to load', async () => {
    service.listPage.mockRejectedValue(new Error('Too many requests'));
    renderWithClient(<PublicLeaderboardsPage />);
    expect(await screen.findByText('Too many requests')).toBeInTheDocument();
  });
});

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@visin/frontend-core', async importOriginal => ({
  ...(await importOriginal<typeof import('@visin/frontend-core')>()),
  useCompactLayout: () => layout.compact
}));

const renderBoard = () => renderWithClient(<PublicLeaderboardPage />, { path: '/leaderboards/road-test/1', route: '/leaderboards/:slug/:version' });

describe('PublicLeaderboardPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    layout.compact = false;
    service.get.mockResolvedValue(board());
  });

  it('puts the licence of the evaluated data above the ranking, or says none was stated', async () => {
    renderBoard();
    expect(await screen.findByLabelText('Terms of the evaluated data')).toHaveTextContent('Licence not stated');
  });

  it('shows a non-commercial data licence as such, with where the data is and how to credit it', async () => {
    service.get.mockResolvedValue(
      board({
        suite: suite({
          dataTerms: {
            license: { id: 'cc-by-nc-4.0', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/', commercial: false },
            sourceUrl: 'https://data.example.test/roads',
            credit: 'Road Lab, 2025'
          }
        })
      })
    );
    renderBoard();
    const terms = await screen.findByLabelText('Terms of the evaluated data');
    expect(within(terms).getByRole('link', { name: 'CC BY-NC 4.0 · non-commercial' })).toBeInTheDocument();
    expect(within(terms).getByRole('link', { name: 'Where to get the data' })).toHaveAttribute('href', 'https://data.example.test/roads');
    expect(terms).toHaveTextContent('Credit: Road Lab, 2025');
  });

  it('is a list on a phone, each model with its headline, worst condition and gap, leading to its evidence', async () => {
    layout.compact = true;
    renderBoard();
    expect(await screen.findByRole('link', { name: /1\. Model B/ })).toHaveAttribute('href', '/leaderboards/road-test/1/e1');
    expect(screen.getByText('night 0.7000')).toBeInTheDocument();
    expect(screen.getByText('0.0400')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2\. acme\/clft @ 3f2a1c9/ })).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Leaderboard' })).not.toBeInTheDocument();
  });

  it('retains global ranks while navigating model pages', async () => {
    service.get.mockImplementation(async (_slug, _version, { page }) => board({
      entries: [{ ...board().entries[0], rank: (page - 1) * 100 + 1 }],
      pagination: { page, limit: 100, total: 101, pages: 2 }
    }));
    renderBoard();
    await screen.findByRole('table', { name: 'Leaderboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    expect(await screen.findByRole('cell', { name: '101' })).toBeInTheDocument();
    expect(service.get).toHaveBeenLastCalledWith('road-test', '1', { page: 2 });
  });

  it('shows only observed results when the switch is on, from the first page, and keeps it in the URL', async () => {
    renderWithClient(<PublicLeaderboardPage />, { path: '/leaderboards/road-test/1?page=2', route: '/leaderboards/:slug/:version' });
    await screen.findByRole('table', { name: 'Leaderboard' });
    await userEvent.click(screen.getByRole('switch', { name: 'Observed evidence only' }));
    await waitFor(() => expect(service.get).toHaveBeenLastCalledWith('road-test', '1', { page: 1, evidence: 'observed' }));
    expect(screen.getByRole('switch', { name: 'Observed evidence only' })).toBeChecked();
  });

  it('offers to export the published ranking, with each condition as a column', async () => {
    renderBoard();
    await screen.findByRole('table', { name: 'Leaderboard' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const latex = (await screen.findByLabelText('LaTeX export')) as HTMLTextAreaElement;
    expect(latex.value).toContain('Model B');
    expect(latex.value).toMatch(/Rank & Model & mIoU\\_foreground & day & night/);
  });

  it('says so, and keeps the switch, when no published result has observed evidence', async () => {
    service.get.mockResolvedValue(board({ entries: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } }));
    renderWithClient(<PublicLeaderboardPage />, { path: '/leaderboards/road-test/1?evidence=observed', route: '/leaderboards/:slug/:version' });
    expect(await screen.findByText(/No published result here has complete observed evidence/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Observed evidence only' })).toBeChecked();
  });

  it('distinguishes an empty later page from a suite with no published results', async () => {
    service.get.mockResolvedValue(board({ entries: [], pagination: { page: 3, limit: 100, total: 101, pages: 2 } }));
    renderWithClient(<PublicLeaderboardPage />, { path: '/leaderboards/road-test/1?page=3', route: '/leaderboards/:slug/:version' });
    expect(await screen.findByText('No models on this page.')).toBeInTheDocument();
  });

  it('ranks the models with each condition, the worst one and the gap, each leading to its evidence', async () => {
    renderBoard();
    const table = within(await screen.findByRole('table', { name: 'Leaderboard' }));
    expect(table.getByRole('columnheader', { name: 'mIoU_foreground (ratio)' })).toBeInTheDocument();
    expect(table.getByRole('columnheader', { name: 'day' })).toBeInTheDocument();
    const rows = table.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: 'Model B' })).toHaveAttribute('href', '/leaderboards/road-test/1/e1');
    expect(within(rows[0]).getByText('0.7400')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Road team · 02.10.2026')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: 'acme/clft @ 3f2a1c9' })).toBeInTheDocument();
    expect(within(rows[1]).getByText('01.10.2026 · attested')).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/attested/)).not.toBeInTheDocument();
    // a condition this model has no score in is a dash, never a zero
    expect(within(rows[1]).getAllByText('-')).toHaveLength(1);
    expect(service.get).toHaveBeenCalledWith('road-test', '1', { page: 1 });
  });

  it('says the results are the submitters\' own, how the ranking was formed, and when it was computed', async () => {
    renderBoard();
    expect(await screen.findByText(/reported by whoever submitted them/)).toBeInTheDocument();
    expect(screen.getByText(/Higher mIoU_foreground is better, formed as the mean of the condition scores/)).toBeInTheDocument();
    expect(screen.getByText(/never its best/)).toBeInTheDocument();
    expect(screen.getByText(/Data: Road test frames, split test/)).toBeInTheDocument();
    expect(screen.getByText(/Protocol abababababab · evaluated with visin-fusion ≥ 1.0.0/)).toBeInTheDocument();
  });

  it.each([
    [{ kind: 'hf' as const, repo: 'acme/frames', commit: COMMIT }, /Hub dataset acme\/frames @ 3f2a1c9/, 'pooled' as const, /counted across every sample/],
    [{ kind: 'visin' as const }, /A Visin dataset/, 'sample-weighted-mean' as const, /weighted by sample count/]
  ])('describes %j data and a %s overall without naming anything private', async (data, dataPattern, aggregation, aggregationPattern) => {
    service.get.mockResolvedValue(board({ suite: suite({ data, aggregation, headline: { key: 'loss', direction: 'min' } }) }));
    renderBoard();
    expect(await screen.findByText(dataPattern)).toBeInTheDocument();
    expect(screen.getByText(aggregationPattern)).toBeInTheDocument();
    expect(screen.getByText(/Lower loss is better/)).toBeInTheDocument();
  });

  it('marks an archived suite, and says when nothing is published instead of drawing an empty table', async () => {
    service.get.mockResolvedValue(board({ entries: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 }, suite: suite({ archived: true, description: 'Held-out frames.' }) }));
    renderBoard();
    expect(await screen.findByText('Nothing is published on this suite right now.')).toBeInTheDocument();
    expect(screen.getByText('Archived suite')).toBeInTheDocument();
    expect(screen.getByText('Held-out frames.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Leaderboard' })).not.toBeInTheDocument();
  });

  it('shows the server\'s answer when there is no such leaderboard, and a plain message otherwise', async () => {
    service.get.mockRejectedValue(new Error('Leaderboard not found'));
    renderBoard();
    expect(await screen.findByText('Leaderboard not found')).toBeInTheDocument();
  });

  it('falls back to a plain message for an error that is not one', async () => {
    service.get.mockRejectedValue('nope');
    renderBoard();
    expect(await screen.findByText('Leaderboard not found')).toBeInTheDocument();
  });
});

const evaluation = (overrides: Partial<PublicEvaluation> = {}): PublicEvaluation => ({
  evaluationId: 'e1',
  suite: suite(),
  checkpoint: { kind: 'local', label: 'clftv2-epoch-40', sha256: 'a'.repeat(64) },
  scores: { conditions: { day: { m: 0.8 }, night: { m: 0.6 } }, overall: { m: 0.7 } },
  sampleCounts: { day: 120, night: 100 },
  evaluator: { package: 'visin-fusion', version: '1.4.2', commit: '9d1c2ab' },
  project: { name: 'Road team' },
  evidence: 'submitter-reported',
  evidenceLevel: 'observed',
  executedAt: '2026-09-30T08:00:00.000Z',
  publishedAt: '2026-10-02T09:00:00.000Z',
  ...overrides
});
const renderEvidence = () =>
  renderWithClient(<PublicEvaluationPage />, { path: '/leaderboards/road-test/1/e1', route: '/leaderboards/:slug/:version/:id' });

describe('PublicEvaluationPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    service.evaluation.mockResolvedValue(evaluation());
  });

  it('shows the scores and the evidence a public reader may see, and says it is reported', async () => {
    renderEvidence();
    expect(await screen.findByRole('heading', { level: 1, name: 'clftv2-epoch-40' })).toBeInTheDocument();
    expect(screen.getByText(/Reported by whoever submitted it/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Scores' })).toBeInTheDocument();
    expect(screen.getByText('day 120 · night 100')).toBeInTheDocument();
    expect(screen.getByText('visin-fusion 1.4.2 (9d1c2ab)')).toBeInTheDocument();
    expect(screen.getByText('Road team')).toBeInTheDocument();
    expect(screen.getByText(/clftv2-epoch-40 · sha256 a{64}/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Road scenes · road-test@1/ })).toHaveAttribute('href', '/leaderboards/road-test/1');
    expect(service.evaluation).toHaveBeenCalledWith('e1');
  });

  it('says whether the evaluator sent complete evidence, less, or a manager vouched for an older result', async () => {
    for (const [level, text] of [
      ['observed', /Observed\. The evaluator sent the data, protocol and evaluator it ran/],
      ['reported', /Reported\. Ranked on the submitter’s word/],
      ['attested', /Attested\. A project manager promoted an older result/]
    ] as const) {
      service.evaluation.mockResolvedValue(evaluation({ evidenceLevel: level }));
      const { unmount } = renderEvidence();
      expect(await screen.findByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it('links a Hub checkpoint to its commit, and leaves out what was not reported', async () => {
    service.evaluation.mockResolvedValue(evaluation({
      checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT, path: 'best.safetensors' },
      evaluator: undefined, project: undefined, sampleCounts: undefined, executedAt: undefined, scores: undefined
    }));
    renderEvidence();
    const link = await screen.findByRole('link', { name: /acme\/clft @ 3f2a1c9 · best.safetensors/ });
    expect(link).toHaveAttribute('href', `https://huggingface.co/acme/clft/blob/${COMMIT}/best.safetensors`);
    expect(screen.queryByText('Evaluator')).not.toBeInTheDocument();
    expect(screen.queryByText('Submitted by')).not.toBeInTheDocument();
    expect(screen.queryByText('Samples')).not.toBeInTheDocument();
    expect(screen.queryByText('Ran')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Scores' })).not.toBeInTheDocument();
  });

  it('says a checkpoint was not given, and an evaluator with only some fields', async () => {
    service.evaluation.mockResolvedValue(evaluation({ checkpoint: undefined, evaluator: { package: 'p' } }));
    renderEvidence();
    expect(await screen.findByText('Not given')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Unknown checkpoint' })).toBeInTheDocument();
    expect(screen.getByText('p')).toBeInTheDocument();
  });

  it('is not found once the result is withdrawn or private', async () => {
    service.evaluation.mockRejectedValue(new Error('Evaluation not found'));
    renderEvidence();
    expect(await screen.findByText('Evaluation not found')).toBeInTheDocument();
    service.evaluation.mockRejectedValue('x');
  });

  it('falls back to a plain message for an error that is not one', async () => {
    service.evaluation.mockRejectedValue('nope');
    renderEvidence();
    expect(await screen.findByText('Result not found')).toBeInTheDocument();
  });
});
