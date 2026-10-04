import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';

const config = vi.hoisted(() => ({ value: {} as Record<string, string | undefined> }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config.value }));

import LeaderboardPreview from './LeaderboardPreview';
import userEvent from '@testing-library/user-event';
import type { RecordedLeaderboard } from '../leaderboard';

const recorded = (overrides: Partial<RecordedLeaderboard> = {}): RecordedLeaderboard => ({
  metric: 'overall.score', direction: 'max',
  entries: [
    { rank: 1, evaluationId: 'e1', checkpoint: { kind: 'local', label: 'Model' }, project: { name: 'Public project' }, dataset: 'Test data', epoch: 0, value: 0.8, verified: true },
    { rank: 2, evaluationId: 'e2', run: { name: 'Migrated run' }, project: { name: 'Public project' }, value: 0, verified: false }
  ],
  ...overrides
});

const reply = (data: unknown) => ({ ok: true, json: async () => ({ data }) });
const phone = (matches: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn()
  }));

beforeEach(() => {
  config.value = {
    VISION_API_URL: 'https://api.example.test',
    SHELL_FRONT_URL: 'https://app.example.test/',
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('default recorded leaderboard preview', () => {


  it('filters verification on the server and keeps evaluation links, metric and zero scores', async () => {
    const mock = vi.fn(async (url: string) => reply(url.includes('verification=verified') ? recorded({ entries: [recorded().entries[0]] }) : recorded()));
    vi.stubGlobal('fetch', mock);
    render(<LeaderboardPreview />);
    const table = await screen.findByRole('table', { name: 'Recorded result leaderboard' });
    expect(within(table).getByRole('link', { name: 'Migrated run' })).toHaveAttribute('href', 'https://app.example.test/evaluations/e2');
    expect(within(table).getByText('0.0000')).toBeInTheDocument();
    expect(within(table).getByText('Test data')).toBeInTheDocument();
    expect(within(table).getByText('· Epoch 0')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Verification' }));
    await userEvent.click(screen.getByRole('option', { name: 'Verified' }));
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('https://api.example.test/api/evaluations/leaderboard?verification=verified&limit=5', expect.anything()));
    expect(await screen.findByRole('img', { name: 'Verified' })).toBeInTheDocument();
    expect(screen.queryByText('Migrated run')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Verification' }));
    await userEvent.click(screen.getByRole('option', { name: 'Not verified' }));
    await waitFor(() => expect(mock).toHaveBeenLastCalledWith('https://api.example.test/api/evaluations/leaderboard?verification=unverified&limit=5', expect.anything()));
  });

  it('shows an explicit empty state rather than requiring a featured leaderboard', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(recorded({ entries: [] }))));
    render(<LeaderboardPreview />);
    expect(await screen.findByText('No recorded results match this filter.')).toBeInTheDocument();
    expect(screen.queryByText('No leaderboard is featured here')).not.toBeInTheDocument();
  });

  it('keeps the rest of the landing page usable when recorded results cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    render(<LeaderboardPreview />);
    expect(await screen.findByText('The leaderboard is not available right now')).toBeInTheDocument();
  });

  it('shows scores, data and verification together on a phone', async () => {
    phone(true);
    vi.stubGlobal('fetch', vi.fn(async () => reply(recorded())));
    render(<LeaderboardPreview />);
    const rows = within(await screen.findByRole('list', { name: 'Recorded result leaderboard' })).getAllByRole('listitem');
    expect(within(rows[0]).getByRole('link', { name: 'Model' })).toHaveAttribute('href', 'https://app.example.test/evaluations/e1');
    expect(within(rows[0]).getByText('Public project · Test data · Epoch 0')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Public project')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('img', { name: 'Not verified' })).toBeInTheDocument();
  });

  it.each([true, false])('shows names and scores without app links when the app URL is missing (phone %s)', async compact => {
    phone(compact);
    config.value.SHELL_FRONT_URL = undefined;
    vi.stubGlobal('fetch', vi.fn(async () => reply(recorded({
      metric: undefined, direction: 'min', entries: [recorded().entries[0], { ...recorded().entries[1], run: undefined }]
    }))));
    render(<LeaderboardPreview />);
    expect(await screen.findByText(/Lower score is better/)).toBeInTheDocument();
    expect(screen.getByText(/Evaluation/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Model' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'All leaderboards' })).not.toBeInTheDocument();
  });
});

it('shows unavailable without making a request when the API URL is missing', () => {
  config.value.VISION_API_URL = undefined;
  const mock = vi.fn(); vi.stubGlobal('fetch', mock);
  render(<LeaderboardPreview />);
  expect(screen.getByText('The leaderboard is not available right now')).toBeInTheDocument();
  expect(mock).not.toHaveBeenCalled();
});

it('aborts the request when the preview unmounts', async () => {
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  }));
  const { unmount } = render(<LeaderboardPreview />);
  expect(screen.getByText('Loading the leaderboard…')).toBeInTheDocument();
  await waitFor(() => expect(signal).toBeDefined());
  unmount(); expect(signal!.aborted).toBe(true);
});
