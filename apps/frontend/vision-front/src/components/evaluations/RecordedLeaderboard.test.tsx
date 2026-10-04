import { beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordedLeaderboard from './RecordedLeaderboard';
import { renderWithClient } from '../../test/renderWithClient';
import type { RecordedLeaderboardPage } from '../../types/evaluation';

const service = vi.hoisted(() => ({ leaderboard: vi.fn() }));
const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('@visin/frontend-core', async original => ({ ...await original<typeof import('@visin/frontend-core')>(), useCompactLayout: () => layout.compact }));
vi.mock('../../services/evaluationService', () => ({ evaluationService: service }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'manager' } }) }));
const page: RecordedLeaderboardPage = {
  metric: 'overall.score', metrics: ['overall.score', 'loss'], direction: 'max', verification: 'all',
  pagination: { page: 1, limit: 100, total: 2, pages: 1 },
  entries: [
    { rank: 1, evaluationId: 'e1', checkpoint: { kind: 'local', label: 'Model', sha256: 'a'.repeat(64) }, project: { id: 'p1', name: 'Project' }, value: 0.9, verified: true, receivedAt: '2026-10-04' },
    { rank: 2, evaluationId: 'e2', run: { id: 'run', name: 'Migrated run' }, epoch: 0, dataset: 'Test data', project: { id: 'p1', name: 'Project' }, value: 0.8, verified: false, receivedAt: '2026-10-04' }
  ]
};
beforeEach(() => { vi.resetAllMocks(); layout.compact = false; service.leaderboard.mockResolvedValue(page); });

it('shows scores and verification together on a phone without scrolling sideways', async () => {
  layout.compact = true;
  renderWithClient(<RecordedLeaderboard />);
  expect(await screen.findByRole('link', { name: /2. Migrated run/ })).toHaveAttribute('href', '/evaluations/e2');
  expect(screen.getByRole('img', { name: 'Verified' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Not verified' })).toBeInTheDocument();
  expect(screen.getByText('0.8000')).toBeInTheDocument();
  expect(screen.getByText('Project · Test data · Epoch 0')).toBeInTheDocument();
});

it('shows migrated and verified results together, with labels and links', async () => {
  renderWithClient(<RecordedLeaderboard />);
  const table = await screen.findByRole('table', { name: 'Recorded result leaderboard' });
  expect(within(table).getByRole('img', { name: 'Verified' })).toBeInTheDocument();
  expect(within(table).getByRole('img', { name: 'Not verified' })).toBeInTheDocument();
  expect(within(table).getByRole('link', { name: 'Migrated run' })).toHaveAttribute('href', '/evaluations/e2');
  expect(within(table).getByText('Epoch 0')).toBeInTheDocument();
  expect(within(table).getByText('Test data')).toBeInTheDocument();
});

it('filters verification and selects score direction and metric on the server', async () => {
  renderWithClient(<RecordedLeaderboard />);
  await screen.findByRole('table');
  const select = async (label: string, option: string) => {
    await userEvent.click(screen.getByRole('combobox', { name: label }));
    await userEvent.click(screen.getByRole('option', { name: option }));
  };
  await select('Verification', 'Verified');
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ verification: 'verified', page: 1 })));
  await select('Verification', 'Not verified');
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ verification: 'unverified' })));
  await select('Best score', 'Lowest');
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ direction: 'min' })));
  await select('Metric', 'loss');
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ metric: 'loss', direction: undefined, page: 1 })));
});

it('pages scores and resets pagination when the filter changes', async () => {
  service.leaderboard.mockResolvedValue({ ...page, pagination: { page: 1, limit: 100, total: 101, pages: 2 } });
  renderWithClient(<RecordedLeaderboard />);
  await screen.findByRole('table');
  await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  await userEvent.click(screen.getByRole('combobox', { name: 'Verification' }));
  await userEvent.click(screen.getByRole('option', { name: 'Verified' }));
  await waitFor(() => expect(service.leaderboard).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })));
});

it('handles an empty board without a metric', async () => {
  service.leaderboard.mockResolvedValue({ ...page, metric: undefined, metrics: [], entries: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } });
  renderWithClient(<RecordedLeaderboard />);
  expect(await screen.findByText('No recorded results match these filters.')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Metric' })).not.toBeInTheDocument();
});

it('reports API failures', async () => {
  service.leaderboard.mockRejectedValue(new Error('Server unavailable'));
  renderWithClient(<RecordedLeaderboard />);
  expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
});

it('labels an evaluation with no checkpoint or live source', async () => {
  service.leaderboard.mockResolvedValue({ ...page, entries: [{ ...page.entries[1], run: undefined, epoch: undefined, dataset: undefined }] });
  renderWithClient(<RecordedLeaderboard />);
  expect(await screen.findByRole('link', { name: 'Evaluation' })).toHaveAttribute('href', '/evaluations/e2');
});
