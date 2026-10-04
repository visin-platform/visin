import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';

const service = vi.hoisted(() => ({ get: vi.fn(), trash: vi.fn(), publish: vi.fn(), withdraw: vi.fn(), verify: vi.fn() }));
vi.mock('../services/evaluationService', () => ({ evaluationService: service }));
const auth = vi.hoisted(() => ({ isAuthenticated: true }));
const appConfig = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => appConfig.value }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock
}));

import EvaluationDetailPage from './EvaluationDetailPage';
import { renderWithClient } from '../test/renderWithClient';
import type { Evaluation } from '../types/evaluation';

const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
const evaluation = (overrides: Partial<Evaluation> = {}): Evaluation => ({
  _id: 'e1',
  uuid: 'u1',
  projectId: 'p1',
  ownerId: 'o1',
  checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label: 'clftv2-epoch-40' },
  checkpointKey: `sha256:${'a'.repeat(64)}`,
  suite: { id: 's1', slug: 'road-test', version: 1, digest: 'abcdef0123456789'.repeat(4) },
  status: 'completed',
  sampleCounts: { day: 120, night: 100 },
  executedAt: '2026-09-30T08:00:00.000Z',
  receivedAt: '2026-10-01T09:00:00.000Z',
  createdAt: '2026-10-01T09:00:00.000Z',
  validation: {
    version: 1,
    state: 'eligible',
    reasons: [],
    warnings: [{ code: 'submitted-overall-differs', detail: 'm' }],
    scores: { conditions: { day: { m: 0.8 }, night: { m: 0.6 } }, overall: { m: 0.7 } }
  },
  results: { day: { overall: { m: 0.8 } } },
  provenance: { evaluator: { package: 'visin-fusion', version: '1.2.0' } },
  ...overrides
});

const renderPage = () => renderWithClient(<EvaluationDetailPage />, { path: '/evaluations/e1', route: '/evaluations/:id' });

describe('EvaluationDetailPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.isAuthenticated = true;
    appConfig.value = {};
    service.get.mockResolvedValue(evaluation());
  });

  it('shows the verdict, and the scores that are ranked, condition by condition with the overall last', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'clftv2-epoch-40' })).toBeInTheDocument();
    expect(screen.getByText('Scored on road-test@1')).toBeInTheDocument();
    expect(screen.getByText(/Complete, in range and on the suite’s protocol/)).toBeInTheDocument();
    expect(screen.getByText('The overall “m” that was sent differs from the one computed from the conditions; the computed one is used.')).toBeInTheDocument();
    const rows = within(screen.getByRole('table', { name: 'Scores' })).getAllByRole('row').slice(1);
    expect(rows.map(row => Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent))).toEqual([
      ['day', '0.8000'],
      ['night', '0.6000'],
      ['Overall', '0.7000']
    ]);
    expect(service.get).toHaveBeenCalledWith('e1');
  });

  it('traces the number to its evidence: the suite and protocol, the checkpoint, the samples and the times', async () => {
    renderPage();
    await screen.findByText('Evidence');
    expect(screen.getByRole('link', { name: 'road-test@1' })).toHaveAttribute('href', '/suites/road-test/1');
    expect(screen.getByText('protocol abcdef012345')).toBeInTheDocument();
    expect(screen.getByText(/Held outside Visin · sha256 a{64}/)).toBeInTheDocument();
    expect(screen.getByText('day 120 · night 100')).toBeInTheDocument();
    expect(screen.getByText('Ran')).toBeInTheDocument();
  });

  it('links a Hub checkpoint to the commit, and a source run to its page', async () => {
    service.get.mockResolvedValue(evaluation({
      checkpoint: { kind: 'hf', repo: 'acme/clft', commit: COMMIT, path: 'best.safetensors' },
      source: { trainingId: 't1', epoch: 12 },
      executedAt: undefined
    }));
    renderPage();
    const hub = await screen.findByRole('link', { name: /acme\/clft @ 3f2a1c9 · best.safetensors/ });
    expect(hub).toHaveAttribute('href', `https://huggingface.co/acme/clft/blob/${COMMIT}/best.safetensors`);
    expect(screen.getByRole('link', { name: 'Open the run' })).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByText(/, epoch 12/)).toBeInTheDocument();
    expect(screen.queryByText('Ran')).not.toBeInTheDocument();
  });

  it('says plainly what is reported rather than verified, shows provenance and the raw results, and notes a promotion', async () => {
    service.get.mockResolvedValue(evaluation({ provenance: { promoted: { evaluationId: 'tr1', by: 'u' } } }));
    renderPage();
    expect(await screen.findByText(/Reported by whoever submitted this result/)).toBeInTheDocument();
    expect(screen.getByText('A result recorded without this suite, copied unchanged')).toBeInTheDocument();
    expect(screen.getByLabelText('Provenance (JSON)').textContent).toContain('"evaluationId": "tr1"');
    expect(screen.getByText('Raw results')).toBeInTheDocument();
  });

  it('shows what the evaluator reported, and says it has not been verified', async () => {
    service.get.mockResolvedValue(evaluation({
      validation: { ...evaluation().validation, evidence: 'observed' },
      evidence: {
        kind: 'observed',
        data: { kind: 'external', manifestSha256: 'b'.repeat(64) },
        protocolDigest: 'c'.repeat(64),
        evaluator: { package: 'visin-fusion', version: '1.4.2' },
        classes: { scored: ['car', 'tree'], ignored: ['void'] }
      }
    }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'What the evaluator reported' })).toBeInTheDocument();
    expect(screen.getByText('Observed')).toBeInTheDocument();
    expect(screen.getByText(/Visin has not verified it/)).toBeInTheDocument();
    expect(screen.getByText(`Sample manifest ${'b'.repeat(64)}`)).toBeInTheDocument();
    expect(screen.getByText('c'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('visin-fusion 1.4.2')).toBeInTheDocument();
    expect(screen.getByText('car, tree')).toBeInTheDocument();
    expect(screen.getByText('void')).toBeInTheDocument();
  });

  it('describes Hub and Visin data by what pins them', async () => {
    service.get.mockResolvedValue(evaluation({ evidence: { kind: 'observed', data: { kind: 'hf', repo: 'acme/frames', commit: COMMIT } } }));
    const { unmount } = renderPage();
    expect(await screen.findByText(`Hub dataset acme/frames @ ${COMMIT}`)).toBeInTheDocument();
    unmount();
    service.get.mockResolvedValue(evaluation({ evidence: { kind: 'observed', data: { kind: 'visin', archiveSha256: 'd'.repeat(64) } } }));
    renderPage();
    expect(await screen.findByText(`Visin dataset archive ${'d'.repeat(64)}`)).toBeInTheDocument();
  });

  it('says an attested result observed nothing, and shows what the manager claimed', async () => {
    service.get.mockResolvedValue(evaluation({
      validation: { ...evaluation().validation, evidence: 'attested' },
      evidence: {
        kind: 'attested',
        by: 'u1',
        at: '2026-10-02T10:00:00.000Z',
        evaluationId: 'tr1',
        claims: { checkpoint: { kind: 'local', sha256: 'a'.repeat(64), label: 'final' }, sampleCounts: { day: 120, night: 100 } }
      }
    }));
    renderPage();
    expect(await screen.findByText('Attested')).toBeInTheDocument();
    expect(screen.getByText(/Nothing was observed for this result/)).toBeInTheDocument();
    expect(screen.getAllByText('final').length).toBeGreaterThan(0);
    expect(screen.getAllByText('day 120 · night 100')).toHaveLength(2);
    expect(screen.getByText(/evaluation tr1/)).toBeInTheDocument();
  });

  it('says so when no evidence was sent, and that the result is ranked on the submitter’s word', async () => {
    service.get.mockResolvedValue(evaluation({ validation: { ...evaluation().validation, evidence: 'reported' } }));
    renderPage();
    expect(await screen.findByText(/No evidence about the data, protocol or evaluator was sent/)).toBeInTheDocument();
    expect(screen.getByText(/ranked on the submitter’s word/)).toBeInTheDocument();
    expect(screen.getByText('Reported')).toBeInTheDocument();
  });

  it('tabulates whatever conditions, classes and metrics the result reports, apart from the ranked scores', async () => {
    service.get.mockResolvedValue(evaluation({
      results: {
        day: { overall: { mIoU: 0.8 }, vehicle: { iou: 0.84, f1: 0.9 } },
        night: { overall: { mIoU: 0 }, vehicle: { iou: 0 } },
        overall: { mIoU: 0.55 }
      }
    }));
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Results by condition and class' })).toBeInTheDocument();
    const table = within(screen.getByRole('table', { name: 'Reported results' }));
    expect(table.getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Condition', 'Class', 'mIoU', 'iou', 'f1']);
    const rows = table.getAllByRole('row').slice(1).map(row => Array.from(row.querySelectorAll('th, td')).map(cell => cell.textContent));
    expect(rows).toEqual([
      ['day', 'overall (as reported)', '0.8000', '-', '-'],
      ['day', 'vehicle', '-', '0.8400', '0.9000'],
      ['night', 'overall (as reported)', '0.0000', '-', '-'],
      ['night', 'vehicle', '-', '0.0000', '-'],
      ['Whole test (as reported)', '', '0.5500', '-', '-']
    ]);
    expect(screen.getByText(/not the overall that is ranked/)).toBeInTheDocument();
  });

  it('says so when the result has no numbers to tabulate', async () => {
    service.get.mockResolvedValue(evaluation({ results: { note: 'text' } }));
    renderPage();
    expect(await screen.findByText(/holds no numbers to tabulate/)).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Reported results' })).not.toBeInTheDocument();
  });

  it('links an unranked result\'s reasons to the guide on the configured docs site, and only that', async () => {
    appConfig.value = { LANDING_FRONT_URL: 'https://docs.example.test/' };
    service.get.mockResolvedValue(evaluation({
      validation: { version: 2, state: 'incomplete', reasons: [{ code: 'no-checkpoint' }], warnings: [] }
    }));
    const { unmount } = renderPage();
    const link = await screen.findByRole('link', { name: /Why is my result unranked/ });
    expect(link).toHaveAttribute('href', 'https://docs.example.test/docs/eligibility');
    unmount();

    appConfig.value = {};
    renderPage();
    await screen.findByText('It does not say which checkpoint was scored.');
    expect(screen.queryByRole('link', { name: /Why is my result unranked/ })).not.toBeInTheDocument();
  });

  it('offers no guide link for a result that is ranked', async () => {
    appConfig.value = { LANDING_FRONT_URL: 'https://docs.example.test' };
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'clftv2-epoch-40' });
    expect(screen.queryByRole('link', { name: /Why is my result unranked/ })).not.toBeInTheDocument();
  });

  it('gives the reasons in words when it cannot be ranked, with no scores table', async () => {
    service.get.mockResolvedValue(evaluation({
      checkpoint: undefined,
      suite: undefined,
      sampleCounts: undefined,
      results: undefined,
      provenance: undefined,
      validation: { version: 1, state: 'incomplete', reasons: [{ code: 'missing-condition', detail: 'night' }, { code: 'no-checkpoint' }], warnings: [] }
    }));
    renderPage();
    expect(await screen.findByText('The “night” condition has no results.')).toBeInTheDocument();
    expect(screen.getByText('It does not say which checkpoint was scored.')).toBeInTheDocument();
    expect(screen.getByText('Not scored on a suite')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Unknown checkpoint' })).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Scores' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Provenance' })).not.toBeInTheDocument();
  });

  it('moves it to the trash after a confirmation, and returns to the list', async () => {
    service.trash.mockResolvedValue(evaluation());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to trash' }));
    await waitFor(() => expect(service.trash).toHaveBeenCalledWith('e1'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/evaluations'));
  });

  it('shows the server\'s refusal and stays, and lets the dialog be cancelled', async () => {
    service.trash.mockRejectedValue(new Error('Write permission is required for this evaluation'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to trash' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Move to trash' }));
    expect(await screen.findByText('Write permission is required for this evaluation')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('offers no trash button to someone who is not signed in', async () => {
    auth.isAuthenticated = false;
    renderPage();
    await screen.findByText('Evidence');
    expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument();
  });

  it('says it is not found, as for one that is private or gone', async () => {
    service.get.mockRejectedValue(new Error('Evaluation not found'));
    renderPage();
    expect(await screen.findByText('Evaluation not found')).toBeInTheDocument();
    service.get.mockRejectedValue('x');
  });

  it('publishes a ranked result to the public leaderboard, then shows it is public with a link to its public page', async () => {
    service.publish.mockResolvedValue(evaluation({ publishedAt: '2026-10-02T09:00:00.000Z' }));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish to public leaderboard' }));
    await waitFor(() => expect(service.publish).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText(/Anyone can see this result’s scores, checkpoint and sample counts, and nothing else from it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See public page' })).toHaveAttribute('href', '/leaderboards/road-test/1/e1');
    expect(screen.getByRole('button', { name: 'Withdraw from public leaderboard' })).toBeInTheDocument();
  });

  it('withdraws a published result', async () => {
    service.get.mockResolvedValue(evaluation({ publishedAt: '2026-10-02T09:00:00.000Z' }));
    service.withdraw.mockResolvedValue(evaluation());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw from public leaderboard' }));
    await waitFor(() => expect(service.withdraw).toHaveBeenCalledWith('e1'));
    expect(await screen.findByRole('button', { name: 'Publish to public leaderboard' })).toBeInTheDocument();
    expect(screen.queryByText(/Anyone can see/)).not.toBeInTheDocument();
  });

  it('shows why publishing was refused', async () => {
    service.publish.mockRejectedValue(new Error('A result can only be published from a public project. Make the project public first.'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish to public leaderboard' }));
    expect(await screen.findByText(/only be published from a public project/)).toBeInTheDocument();
  });

  it('falls back to a plain message when a refusal is not an error', async () => {
    service.publish.mockRejectedValue('no');
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Publish to public leaderboard' }));
    expect(await screen.findByText('Failed to change publication')).toBeInTheDocument();
  });

  it('shows a published unverified result without hiding its public page', async () => {
    service.get.mockResolvedValue(evaluation({ publishedAt: '2026-10-02T10:00:00.000Z' }));
    renderPage();
    expect(await screen.findByText(/Anyone can see/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Not verified' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See public page' })).toBeInTheDocument();
  });

  it('says a manager of the suite hid the result, with their reason', async () => {
    service.get.mockResolvedValue(evaluation({ hidden: { at: '2026-10-03T10:00:00.000Z', reason: 'Scores do not match the paper' } }));
    renderPage();
    expect(await screen.findByText(/hid this result from its leaderboard: Scores do not match the paper/)).toBeInTheDocument();
  });

  it('says a hidden result with no reason was hidden, and links a correction that replaces a result', async () => {
    service.get.mockResolvedValue(evaluation({ hidden: { at: '2026-10-03T10:00:00.000Z' }, supersededById: 'e9' }));
    renderPage();
    expect(await screen.findByText(/hid this result from its leaderboard\. It cannot be published again/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See the correction' })).toHaveAttribute('href', '/evaluations/e9');
  });

  it('offers no publish button for a result that is not ranked', async () => {
    service.get.mockResolvedValue(evaluation({ validation: { version: 1, state: 'incomplete', reasons: [{ code: 'no-checkpoint' }], warnings: [] } }));
    renderPage();
    await screen.findByText('Evidence');
    expect(screen.queryByRole('button', { name: /public leaderboard/ })).not.toBeInTheDocument();
  });
});


it('uses the same verification toggle for a migrated evaluation without a suite', async () => {
  auth.isAuthenticated = true;
  service.get.mockResolvedValue(evaluation({ suite: undefined }));
  service.verify.mockResolvedValueOnce({ verified: true, verifiedAt: '2026-10-04T10:00:00.000Z', verifiedBy: 'o1' }).mockResolvedValueOnce({ verified: false });
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark verified' }));
  expect(await screen.findByRole('img', { name: 'Verified' })).toBeInTheDocument();
  expect(service.verify).toHaveBeenLastCalledWith('e1', true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove verification' }));
  expect(await screen.findByRole('img', { name: 'Not verified' })).toBeInTheDocument();
  expect(service.verify).toHaveBeenLastCalledWith('e1', false);
});

it('reports a failed verification without showing a verified checkmark', async () => {
  auth.isAuthenticated = true;
  service.get.mockResolvedValue(evaluation());
  service.verify.mockRejectedValue(new Error('Manage access required'));
  renderPage();
  fireEvent.click(await screen.findByRole('button', { name: 'Mark verified' }));
  expect(await screen.findByText('Manage access required')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Not verified' })).toBeInTheDocument();
});
