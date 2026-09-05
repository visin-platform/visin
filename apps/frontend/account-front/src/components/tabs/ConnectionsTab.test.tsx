import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ConnectionsTab from './ConnectionsTab';
import { Connection } from '../../types/connection';

const mockedService = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }));
vi.mock('../../services/connectionService', () => ({ connectionService: mockedService }));

const makeConnection = (overrides: Partial<Connection> = {}): Connection => ({
  id: 'rt1',
  clientId: 'vsn-client-abc',
  clientName: 'Claude',
  scopes: ['vision:read', 'dataset:read'],
  createdAt: '2026-03-01T00:00:00.000Z',
  lastRenewedAt: '2026-09-04T00:00:00.000Z',
  revokedAt: null,
  ...overrides
});

const renderTab = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectionsTab />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.list.mockResolvedValue([makeConnection()]);
  mockedService.revoke.mockResolvedValue(undefined);
});

describe('list states', () => {
  it('shows a spinner while loading', () => {
    mockedService.list.mockReturnValue(new Promise(() => {}));
    renderTab();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('tells the user where an assistant would connect when none are', async () => {
    mockedService.list.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/no apps are connected/i)).toBeInTheDocument();
    expect(screen.getByText(/mcp\.visin\.eu\/mcp/)).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    mockedService.list.mockRejectedValue(new Error('Not authenticated'));
    renderTab();

    expect(await screen.findByText('Not authenticated')).toBeInTheDocument();
  });

  it('names the app, its permissions, and when it was approved', async () => {
    renderTab();

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(screen.getByText('vision:read')).toBeInTheDocument();
    // The grant date, not the last rotation — otherwise it would say someone
    // connected Claude yesterday when they did it in March.
    expect(screen.getByText(/Connected 3\/1\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/last active/i)).toBeInTheDocument();
  });

  it('omits the activity line for a grant that has never refreshed', async () => {
    mockedService.list.mockResolvedValue([makeConnection({ lastRenewedAt: null })]);
    renderTab();

    await screen.findByText('Claude');
    expect(screen.queryByText(/last active/i)).not.toBeInTheDocument();
  });

  it('hides an already-revoked grant', async () => {
    // The page answers "what can reach my account right now"; a disconnected app
    // in the list only invites someone to disconnect it again.
    mockedService.list.mockResolvedValue([
      makeConnection({ revokedAt: '2026-09-05T00:00:00.000Z' })
    ]);
    renderTab();

    expect(await screen.findByText(/no apps are connected/i)).toBeInTheDocument();
    expect(screen.queryByText('Claude')).not.toBeInTheDocument();
  });
});

describe('disconnecting', () => {
  it('is honest that an access token already issued keeps working', async () => {
    // Access tokens are stateless and unrevokable; implying the cut is instant
    // would be a lie the user might rely on.
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /disconnect claude/i }));

    expect(await screen.findByText(/disconnect claude\?/i)).toBeInTheDocument();
    expect(screen.getByText(/up to an hour/i)).toBeInTheDocument();
  });

  it('revokes by client id once confirmed', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /disconnect claude/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => expect(mockedService.revoke).toHaveBeenCalledWith('vsn-client-abc'));
  });

  it('does nothing when the confirmation is dismissed', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /disconnect claude/i }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/up to an hour/i)).not.toBeInTheDocument());
    expect(mockedService.revoke).not.toHaveBeenCalled();
  });

  it('surfaces a failure to disconnect', async () => {
    mockedService.revoke.mockRejectedValue(new Error('No active connection for that application'));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /disconnect claude/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(await screen.findByText(/no active connection/i)).toBeInTheDocument();
  });
});
