import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SessionsCard from './SessionsCard';
import { Session } from '../../types/session';

const mockedService = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn(), revokeOthers: vi.fn() }));
vi.mock('../../services/sessionService', () => ({ sessionService: mockedService }));

const NOW = new Date('2026-09-19T12:00:00.000Z').getTime();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const makeSession = (overrides: Partial<Session> = {}): Session => ({
  id: 'here',
  device: 'Chrome on Android',
  method: 'password',
  createdAt: '2026-09-01T00:00:00.000Z',
  lastSeenAt: ago(1),
  expiresAt: '2026-10-19T00:00:00.000Z',
  current: true,
  ...overrides
});

const laptop = makeSession({
  id: 'laptop',
  device: 'Firefox on Windows',
  method: 'google',
  lastSeenAt: ago(3 * 60),
  current: false
});

const renderCard = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionsCard />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  mockedService.list.mockResolvedValue([makeSession(), laptop]);
  mockedService.revoke.mockResolvedValue(undefined);
  mockedService.revokeOthers.mockResolvedValue(1);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the list', () => {
  it('shows a spinner while loading', () => {
    mockedService.list.mockReturnValue(new Promise(() => {}));
    renderCard();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    mockedService.list.mockRejectedValue(new Error('Not authenticated'));
    renderCard();

    expect(await screen.findByText('Not authenticated')).toBeInTheDocument();
  });

  it('names each device, marks this one, and says how and when it signed in', async () => {
    renderCard();

    expect(await screen.findByText('Chrome on Android')).toBeInTheDocument();
    expect(screen.getByText('This device')).toBeInTheDocument();
    expect(screen.getByText('Firefox on Windows')).toBeInTheDocument();
    expect(screen.getByText(/Signed in with Google/)).toBeInTheDocument();
    expect(screen.getByText(/3 hours ago/)).toBeInTheDocument();
  });

  it.each([
    [5, /Active now/],
    [25, /25 minutes ago/],
    [3 * 24 * 60, /3 days ago/]
  ])('describes activity %i minutes ago as %s', async (minutes, text) => {
    mockedService.list.mockResolvedValue([makeSession(), { ...laptop, lastSeenAt: ago(minutes) }]);
    renderCard();

    await screen.findByText('Firefox on Windows');
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it('says only since when for a session from before sign-in methods were recorded', async () => {
    mockedService.list.mockResolvedValue([makeSession({ method: 'unknown' })]);
    renderCard();

    expect(await screen.findByText(/Since /)).toBeInTheDocument();
  });

  it('offers no sign-out for this device, and no "all others" when there are none', async () => {
    mockedService.list.mockResolvedValue([makeSession()]);
    renderCard();

    await screen.findByText('Chrome on Android');
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });
});

describe('signing out', () => {
  it('signs another device out once confirmed', async () => {
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Firefox on Windows' }));
    expect(await screen.findByText('Sign out Firefox on Windows?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mockedService.revoke).toHaveBeenCalledWith('laptop'));
    // The list is re-read so the device disappears.
    await waitFor(() => expect(mockedService.list).toHaveBeenCalledTimes(2));
  });

  it('signs every other device out once confirmed', async () => {
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out all other devices' }));
    expect(await screen.findByText(/Every device except this one \(1\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mockedService.revokeOthers).toHaveBeenCalled());
  });

  it('does nothing when the confirmation is dismissed', async () => {
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Firefox on Windows' }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText('Sign out Firefox on Windows?')).not.toBeInTheDocument());
    expect(mockedService.revoke).not.toHaveBeenCalled();
  });

  it('surfaces a failure to sign out', async () => {
    mockedService.revoke.mockRejectedValue(new Error('Session not found'));
    renderCard();

    fireEvent.click(await screen.findByRole('button', { name: 'Sign out Firefox on Windows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Session not found')).toBeInTheDocument();
  });
});
