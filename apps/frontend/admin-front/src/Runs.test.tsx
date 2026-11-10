import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderPage } from './test/render';
import Runs from './Runs';
import { admin } from './services/admin';

vi.mock('./services/admin', () => ({ admin: vi.fn() }));
const ADA = '1'.repeat(24);
const report = {
  note: 'Measurement starts with this deployment.',
  guestBudget: { requestsToday: 2, reservedTodayMicros: 500000, reservedMonthMicros: 1500000, dailyCeilingMicros: 2000000, monthlyCeilingMicros: 9000000 },
  runs: [{ _id: 'r1', userId: ADA, name: '', model: 'test-model', state: 'running', createdAt: '2026-11-10T10:00:00Z' }],
  usage: [
    { _id: { userId: ADA, provider: 'anthropic', model: 'test-model', currency: 'USD', kind: 'user' }, calls: 3, inputTokens: 1000, outputTokens: 200, estimatedCost: 0.5, uncertain: 0, unpriced: 0 },
    { _id: { userId: 'guesthash', provider: 'anthropic', model: 'test-model', currency: 'USD', kind: 'guest' }, calls: 1, inputTokens: 10, outputTokens: 5, estimatedCost: 0.01, uncertain: 1, unpriced: 0 }
  ]
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin).mockImplementation((async (path: string, method = 'GET') => {
    if (path.startsWith('/users/lookup')) return [{ id: ADA, email: 'ada@example.test', name: 'Ada Lovelace' }];
    if (method === 'POST') return { cancelled: true };
    return report;
  }) as typeof admin);
});

it('names the people in usage and runs, links them to their account, and keeps guests as guests', async () => {
  renderPage(<Runs />);
  const links = await screen.findAllByRole('link', { name: 'Ada Lovelace (ada@example.test)' });
  expect(links.length).toBeGreaterThanOrEqual(2);
  expect(links[0]).toHaveAttribute('href', `/users?open=${ADA}`);
  expect(screen.getByText('Guest session')).toBeInTheDocument();
});

it('shows the anonymous budget as figures with how much of each ceiling is used', async () => {
  renderPage(<Runs />);
  expect(await screen.findByText('Asked today')).toBeInTheDocument();
  expect(screen.getByText('2')).toBeInTheDocument();
  expect(screen.getByText(/of \$2\.00 daily ceiling/)).toBeInTheDocument();
  expect(screen.getByText(/of \$9\.00 monthly ceiling/)).toBeInTheDocument();
  // 0.5 of 2.0 used today: a quarter of the way, not a warning.
  expect(screen.getByRole('progressbar', { name: 'Reserved today used' })).toHaveAttribute('aria-valuenow', '25');
});

it('flags calls that were never settled, and formats costs in their currency', async () => {
  renderPage(<Runs />);
  expect(await screen.findByText('1 uncertain')).toBeInTheDocument();
  const usage = within(screen.getByRole('region', { name: 'Provider calls, last 30 days' }));
  expect(usage.getByText(/\$0\.50/)).toBeInTheDocument();
});

it('lists each question with its status and times in a 24-hour clock', async () => {
  renderPage(<Runs />);
  expect(await screen.findByText('running')).toBeInTheDocument();
  expect(screen.getByText(/2026, \d\d:\d\d$/)).toBeInTheDocument();
});

it('says so, instead of drawing an empty table, when there is nothing in the period', async () => {
  vi.mocked(admin).mockImplementation((async (path: string) =>
    path.startsWith('/users/lookup') ? [] : { ...report, runs: [], usage: [] }) as typeof admin);
  renderPage(<Runs />);
  expect(await screen.findByText('No provider calls in this period')).toBeInTheDocument();
  expect(screen.getByText('No questions in this period')).toBeInTheDocument();
});

it('cancels a running question', async () => {
  renderPage(<Runs />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel run' }));
  await waitFor(() => expect(admin).toHaveBeenCalledWith('/vivi/admin/runs/r1/cancel', 'POST'));
});

it('opens filtered to one person from a link, says who, and shows everyone again on request', async () => {
  renderPage(<Runs />, `/runs?userId=${ADA}`);
  expect(await screen.findByText(/Showing Ada Lovelace/)).toBeInTheDocument();
  expect(admin).toHaveBeenCalledWith(`/vivi/admin/runs?userId=${ADA}`);
  fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
  await waitFor(() => expect(admin).toHaveBeenCalledWith('/vivi/admin/runs'));
  expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
});
