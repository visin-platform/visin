import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';

const service = vi.hoisted(() => ({ get: vi.fn(), leaderboard: vi.fn(), list: vi.fn() }));
vi.mock('../services/evaluationService', () => ({ suiteService: service }));

import SuitePage from './SuitePage';
import SuitesPage from './SuitesPage';
import { renderWithClient } from '../test/renderWithClient';
import type { Leaderboard, Suite } from '../types/evaluation';

const suite = (overrides: Partial<Suite> = {}): Suite => ({
  _id: 's1',
  slug: 'road-test',
  version: 1,
  name: 'Road scenes',
  description: 'Held-out frames, per lighting condition.',
  projectId: 'p1',
  visibility: 'public',
  submissions: 'open',
  createdBy: 'u1',
  digest: 'ab'.repeat(32),
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  protocol: {
    task: 'semantic-segmentation',
    data: { kind: 'external', label: 'Road test frames', manifestSha256: 'a'.repeat(64) },
    split: 'test',
    conditions: [
      { name: 'day', sampleCount: 120 },
      { name: 'night', sampleCount: 100 }
    ],
    classes: [],
    ignoredClasses: [],
    metrics: [
      { key: 'mIoU_foreground', direction: 'max', unit: 'ratio', headline: true },
      { key: 'mean_ap', direction: 'max' }
    ],
    aggregation: 'equal-mean-of-conditions',
    input: {},
    evaluator: { package: 'visin-fusion', minVersion: '1.0.0' }
  },
  ...overrides
});

const board = (overrides: Partial<Leaderboard> = {}): Leaderboard => ({
  suite: {
    slug: 'road-test',
    version: 1,
    name: 'Road scenes',
    digest: 'ab'.repeat(32),
    headline: { key: 'mIoU_foreground', direction: 'max', unit: 'ratio' }
  },
  selection: 'latest-eligible-completed',
  scope: { candidates: 5, truncated: false },
  entries: [
    {
      evaluationId: 'e1',
      uuid: 'u1',
      checkpointKey: 'k1',
      rank: 1,
      attempts: 3,
      evidenceLevel: 'observed',
      receivedAt: '2026-10-01T09:00:00.000Z',
      checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label: 'Model B' },
      project: { _id: 'p1', name: 'Road', slug: 'road' },
      summary: {
        headline: { key: 'mIoU_foreground', value: 0.74, direction: 'max' },
        worst: { condition: 'rain', value: 0.7 },
        gap: 0.04
      }
    },
    {
      evaluationId: 'e2',
      uuid: 'u2',
      checkpointKey: 'k2',
      rank: 2,
      attempts: 1,
      evidenceLevel: 'attested',
      receivedAt: '2026-10-02T09:00:00.000Z',
      checkpoint: { kind: 'local', sha256: 'b'.repeat(64), label: 'Model A' },
      summary: {
        headline: { key: 'mIoU_foreground', value: 0.7, direction: 'max' },
        worst: { condition: 'rain', value: 0.6 },
        gap: 0.1
      }
    }
  ],
  pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  unrankedPagination: { page: 1, limit: 100, total: 1, pages: 1 },
  unranked: [
    {
      evaluationId: 'e3',
      uuid: 'u3',
      checkpointKey: 'k3',
      state: 'incomplete',
      attempts: 1,
      receivedAt: '2026-10-03T09:00:00.000Z',
      checkpoint: { kind: 'local', sha256: 'c'.repeat(64), label: 'Model D' },
      reasons: [{ code: 'missing-condition', detail: 'rain' }]
    }
  ],
  ...overrides
});

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@visin/frontend-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@visin/frontend-core')>()),
  useCompactLayout: () => layout.compact
}));

const renderSuite = () =>
  renderWithClient(<SuitePage />, { path: '/suites/road-test/1', route: '/suites/:slug/:version' });

describe('SuitePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    layout.compact = false;
    service.get.mockResolvedValue(suite());
    service.leaderboard.mockResolvedValue(board());
  });

  it('says the data’s licence is not stated when the publisher has not said, rather than leaving it out', async () => {
    renderSuite();
    expect(await screen.findByLabelText('Terms of the evaluated data')).toHaveTextContent('Data licenceLicence not stated');
  });

  it('shows what the publisher says about the data: its licence, where to get it, and the credit', async () => {
    service.get.mockResolvedValue(
      suite({
        dataTerms: {
          license: { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', commercial: true },
          sourceUrl: 'https://data.example.test/roads',
          credit: 'Road Lab, 2025'
        }
      })
    );
    renderSuite();
    const terms = await screen.findByLabelText('Terms of the evaluated data');
    expect(within(terms).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    expect(within(terms).getByRole('link', { name: 'Where to get the data' })).toHaveAttribute('href', 'https://data.example.test/roads');
    expect(terms).toHaveTextContent('Credit: Road Lab, 2025');
  });

  it('pages ranked and unranked checkpoints independently and preserves global rank', async () => {
    service.leaderboard.mockImplementation(async (_slug, _version, { page, unrankedPage }) =>
      board({
        entries: [{ ...board().entries[0], rank: (page - 1) * 100 + 1 }],
        pagination: { page, limit: 100, total: 101, pages: 2 },
        unrankedPagination: { page: unrankedPage, limit: 100, total: 101, pages: 2 }
      })
    );
    renderSuite();
    await screen.findByRole('table', { name: 'Ranking' });
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Ranked checkpoint pages' })).getByRole('button', {
        name: 'Go to page 2'
      })
    );
    expect(await screen.findByRole('cell', { name: '101' })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('navigation', { name: 'Unranked checkpoint pages' })).getByRole('button', {
        name: 'Go to page 2'
      })
    );
    expect(service.leaderboard).toHaveBeenLastCalledWith('road-test', '1', { page: 2, unrankedPage: 2 });
  });

  it('ranks only results with observed evidence when the switch is on, from the first page, and keeps it in the URL', async () => {
    renderWithClient(<SuitePage />, { path: '/suites/road-test/1?page=3&unrankedPage=2', route: '/suites/:slug/:version' });
    await screen.findByRole('table', { name: 'Ranking' });
    const toggle = screen.getByRole('switch', { name: 'Observed evidence only' });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith('road-test', '1', { page: 1, unrankedPage: 1, evidence: 'observed' }));
    expect(screen.getByRole('switch', { name: 'Observed evidence only' })).toBeChecked();
    await userEvent.click(screen.getByRole('switch', { name: 'Observed evidence only' }));
    await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith('road-test', '1', { page: 1, unrankedPage: 1 }));
  });

  it('starts with the switch on from a shared link, and says so when no result qualifies', async () => {
    service.leaderboard.mockResolvedValue(board({ entries: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } }));
    renderWithClient(<SuitePage />, { path: '/suites/road-test/1?evidence=observed', route: '/suites/:slug/:version' });
    expect(await screen.findByText(/No result here has complete observed evidence/)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Observed evidence only' })).toBeChecked();
    expect(service.leaderboard).toHaveBeenCalledWith('road-test', '1', { page: 1, unrankedPage: 1, evidence: 'observed' });
  });

  it('marks reported and attested rows in words, and leaves observed ones unmarked', async () => {
    service.leaderboard.mockResolvedValue(
      board({ entries: board().entries.map((entry, index) => ({ ...entry, evidenceLevel: index === 0 ? 'observed' : 'reported' })) })
    );
    renderSuite();
    const rows = within(await screen.findByRole('table', { name: 'Ranking' })).getAllByRole('row').slice(1);
    expect(within(rows[1]).getByText('02.10.2026 · reported')).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/reported|attested/)).not.toBeInTheDocument();
  });

  it('offers to export the ranking on the page, with the rows it shows', async () => {
    renderSuite();
    await screen.findByRole('table', { name: 'Ranking' });
    await userEvent.click(screen.getByRole('button', { name: 'Export' }));
    const latex = (await screen.findByLabelText('LaTeX export')) as HTMLTextAreaElement;
    expect(latex.value).toContain('Model B');
    expect(latex.value).toContain('road-test@1');
  });

  it('picks two checkpoints to compare: a third cannot be added, the button needs two, and it leaves for the comparison', async () => {
    service.leaderboard.mockResolvedValue(
      board({ entries: [...board().entries, { ...board().entries[1], evaluationId: 'e3', uuid: 'u3', rank: 3, checkpoint: { kind: 'local', sha256: 'c'.repeat(64), label: 'Model C' } }] })
    );
    renderSuite();
    await screen.findByRole('table', { name: 'Ranking' });
    const compare = () => screen.getByRole('button', { name: /^Compare/ });
    expect(compare()).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Model B to compare' }));
    expect(compare()).toBeDisabled();
    expect(compare()).toHaveTextContent('Compare (1 of 2)');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Model A to compare' }));
    expect(compare()).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: 'Select Model C to compare' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Model B to compare' }));
    expect(screen.getByRole('checkbox', { name: 'Select Model C to compare' })).toBeEnabled();
    expect(compare()).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Model C to compare' }));
    await userEvent.click(compare());
    expect(await screen.findByTestId('elsewhere')).toBeInTheDocument();
  });

  it.each(['page=0', 'page=nope', 'page=1.5', 'page=9007199254740992'])(
    'falls back to page one for a malformed page URL: %s',
    async (query) => {
      renderWithClient(<SuitePage />, { path: `/suites/road-test/1?${query}`, route: '/suites/:slug/:version' });
      await screen.findByRole('table', { name: 'Ranking' });
      expect(service.leaderboard).toHaveBeenCalledWith('road-test', '1', { page: 1, unrankedPage: 1 });
    }
  );

  it('distinguishes an empty later ranked page from a suite without eligible results', async () => {
    service.leaderboard.mockResolvedValue(
      board({ entries: [], pagination: { page: 3, limit: 100, total: 101, pages: 2 } })
    );
    renderWithClient(<SuitePage />, { path: '/suites/road-test/1?page=3', route: '/suites/:slug/:version' });
    expect(await screen.findByText('No ranked checkpoints on this page.')).toBeInTheDocument();
  });

  it('is a list on a phone: each checkpoint with its rank, headline, worst condition and gap, and what is not ranked', async () => {
    layout.compact = true;
    renderSuite();
    expect(await screen.findByRole('link', { name: /1\. Model B/ })).toHaveAttribute('href', '/evaluations/e1');
    expect(screen.getByText('rain 0.7000')).toBeInTheDocument();
    expect(screen.getByText('0.0400')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2\. Model A/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Model D/ })).toHaveAttribute('href', '/evaluations/e3');
    expect(screen.getByText('The “rain” condition has no results.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Ranking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Not ranked' })).not.toBeInTheDocument();
  });

  it('ranks the checkpoints with the headline, the worst condition and the gap, each leading to its evidence', async () => {
    renderSuite();
    const table = within(await screen.findByRole('table', { name: 'Ranking' }));
    const rows = table.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('link', { name: 'Model B' })).toHaveAttribute('href', '/evaluations/e1');
    expect(within(rows[0]).getByText('0.7400')).toBeInTheDocument();
    expect(within(rows[0]).getByText('rain: 0.7000')).toBeInTheDocument();
    expect(within(rows[0]).getByText('0.0400')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Road · 01.10.2026')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Model A')).toBeInTheDocument();
    // a promoted result is marked, an observed one is not
    expect(within(rows[1]).getByText('02.10.2026 · attested')).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/attested/)).not.toBeInTheDocument();
    expect(service.get).toHaveBeenCalledWith('road-test', '1');
    expect(screen.getByRole('columnheader', { name: 'mIoU_foreground (ratio)' })).toBeInTheDocument();
  });

  it('says how the ranking was formed and over how many results, so a rank is read in its scope', async () => {
    renderSuite();
    expect(await screen.findByText(/Higher mIoU_foreground is better/)).toBeInTheDocument();
    expect(screen.getByText(/Ranked among the 5 evaluations of this suite you can read/)).toBeInTheDocument();
    expect(screen.getByText(/never its best/)).toBeInTheDocument();
  });

  it('says lower is better for a loss, and that the pool was cut when it was', async () => {
    service.leaderboard.mockResolvedValue(
      board({
        suite: {
          slug: 'road-test',
          version: 1,
          name: 'Road scenes',
          digest: 'x',
          headline: { key: 'mean_error', direction: 'min' }
        },
        scope: { candidates: 1, truncated: true }
      })
    );
    renderSuite();
    expect(await screen.findByText(/Lower mean_error is better/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 evaluation of this suite you can read \(the most recent; there are more\)/)
    ).toBeInTheDocument();
  });

  it('lists what is not ranked with the reasons in words', async () => {
    renderSuite();
    const table = within(await screen.findByRole('table', { name: 'Not ranked' }));
    expect(table.getByRole('link', { name: 'Model D' })).toHaveAttribute('href', '/evaluations/e3');
    expect(table.getByText('Incomplete')).toBeInTheDocument();
    expect(table.getByText('The “rain” condition has no results.')).toBeInTheDocument();
  });

  it('shows the protocol: what is measured, how overall is formed, and the digest', async () => {
    renderSuite();
    await screen.findByRole('table', { name: 'Ranking' });
    expect(screen.getByText('semantic-segmentation')).toBeInTheDocument();
    expect(screen.getByText('Road test frames · split test')).toBeInTheDocument();
    expect(screen.getByText('day (120), night (100)')).toBeInTheDocument();
    expect(screen.getByText('mIoU_foreground · higher is better · ratio')).toBeInTheDocument();
    expect(screen.getByText('mean_ap')).toBeInTheDocument();
    expect(screen.getByText(/The mean of the condition scores, computed by Visin/)).toBeInTheDocument();
    expect(screen.getByText('visin-fusion ≥ 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('ab'.repeat(32))).toBeInTheDocument();
    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Held-out frames, per lighting condition.')).toBeInTheDocument();
  });

  it('marks an archived suite, and describes the other kinds of data', async () => {
    service.get.mockResolvedValue(
      suite({
        archivedAt: '2026-10-02T00:00:00.000Z',
        description: undefined,
        visibility: 'private',
        protocol: {
          ...suite().protocol,
          data: { kind: 'hf', repo: 'acme/frames', commit: 'abcdef0123456789abcdef0123456789abcdef01' },
          aggregation: 'pooled'
        }
      })
    );
    renderSuite();
    expect(await screen.findByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Private')).toBeInTheDocument();
    expect(screen.getByText('Hub dataset acme/frames @ abcdef0 · split test')).toBeInTheDocument();
    expect(screen.getByText('Counted across every sample by the evaluator')).toBeInTheDocument();
    expect(screen.getAllByText('road-test@1').length).toBeGreaterThan(0);
  });

  it('describes a Visin dataset and a weighted overall', async () => {
    service.get.mockResolvedValue(
      suite({
        protocol: {
          ...suite().protocol,
          data: { kind: 'visin', datasetId: 'd1', archiveSha256: 'a'.repeat(64) },
          aggregation: 'sample-weighted-mean'
        }
      })
    );
    renderSuite();
    expect(await screen.findByText('Visin dataset d1 · split test')).toBeInTheDocument();
    expect(screen.getByText(/weighted by sample count/)).toBeInTheDocument();
  });

  it('says nothing is ranked yet, rather than showing an empty table', async () => {
    service.leaderboard.mockResolvedValue(
      board({
        entries: [],
        unranked: [],
        scope: { candidates: 0, truncated: false },
        pagination: { page: 1, limit: 100, total: 0, pages: 0 },
        unrankedPagination: { page: 1, limit: 100, total: 0, pages: 0 }
      })
    );
    renderSuite();
    expect(await screen.findByText(/Nothing is ranked yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Not ranked' })).not.toBeInTheDocument();
  });

  it("shows the server's reason when the suite cannot be read", async () => {
    service.get.mockRejectedValue(new Error('Suite not found'));
    renderSuite();
    expect(await screen.findByText('Suite not found')).toBeInTheDocument();
  });

  it('falls back to a plain message for an error that is not one', async () => {
    service.get.mockRejectedValue('nope');
    service.leaderboard.mockRejectedValue('nope');
    renderSuite();
    expect(await screen.findByText('Suite not found')).toBeInTheDocument();
  });
});

describe('SuitesPage', () => {
  beforeEach(() => vi.resetAllMocks());

  it('lists the suites, each leading to its page, with archived ones marked', async () => {
    service.list.mockResolvedValue({
      suites: [
        suite(),
        suite({ _id: 's2', version: 2, name: 'Road v2', visibility: 'private', archivedAt: '2026-10-02T00:00:00.000Z' })
      ],
      pagination: { page: 1, limit: 100, total: 2, pages: 1 }
    });
    renderWithClient(<SuitesPage />);
    expect(await screen.findByRole('link', { name: 'road-test@1' })).toHaveAttribute('href', '/suites/road-test/1');
    expect(screen.getByRole('link', { name: 'road-test@2' })).toHaveAttribute('href', '/suites/road-test/2');
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Road v2')).toBeInTheDocument();
    expect(document.title).toContain('Suites');
  });

  it('says what a suite is when there are none', async () => {
    service.list.mockResolvedValue({ suites: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } });
    renderWithClient(<SuitesPage />);
    expect(await screen.findByText('No suites yet')).toBeInTheDocument();
  });

  it('shows why it failed to load', async () => {
    service.list.mockRejectedValue(new Error('boom'));
    renderWithClient(<SuitesPage />);
    expect(await screen.findByText('boom')).toBeInTheDocument();
    service.list.mockRejectedValue('x');
  });
});
