import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApiKeysTab from './ApiKeysTab';
import { API_KEY_SCOPES, ApiKey } from '../../types/apiKey';

// vi.mock factories are hoisted above module scope, so the mock object has to
// be created inside vi.hoisted to exist by the time the factory runs.
const mockedService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  reveal: vi.fn(),
  revoke: vi.fn(),
  remove: vi.fn()
}));

vi.mock('../../services/apiKeyService', () => ({ apiKeyService: mockedService }));

const makeKey = (overrides: Partial<ApiKey> = {}): ApiKey => ({
  id: 'k1',
  name: 'Claude Code',
  prefix: 'vsn_live_0123456789ab',
  scopes: ['vision:read', 'dataset:read'],
  createdAt: '2026-09-01T00:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  ...overrides
});

const renderTab = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiKeysTab />
    </QueryClientProvider>
  );
};

const openCreateDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /new key/i }));
  return screen.findByRole('dialog');
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedService.list.mockResolvedValue([makeKey()]);
  mockedService.create.mockResolvedValue({ key: makeKey(), token: 'vsn_live_0123456789ab_secret' });
  mockedService.reveal.mockResolvedValue('vsn_live_0123456789ab_secret');
  mockedService.revoke.mockResolvedValue(makeKey({ revokedAt: '2026-09-05T00:00:00.000Z' }));
  mockedService.remove.mockResolvedValue(undefined);
});

describe('list states', () => {
  it('shows a spinner while loading', () => {
    mockedService.list.mockReturnValue(new Promise(() => {}));
    renderTab();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('invites the user to create one when there are none', async () => {
    mockedService.list.mockResolvedValue([]);
    renderTab();

    expect(await screen.findByText(/you have no api keys/i)).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    mockedService.list.mockRejectedValue(new Error('API keys are not enabled on this deployment.'));
    renderTab();

    expect(await screen.findByText(/not enabled on this deployment/i)).toBeInTheDocument();
  });

  it('shows the prefix but never a usable key', async () => {
    renderTab();

    expect(await screen.findByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText(/vsn_live_0123456789ab…/)).toBeInTheDocument();
    expect(screen.getByText('vision:read')).toBeInTheDocument();
  });

  it('answers "is anything still using this?" for a key that never was', async () => {
    renderTab();

    expect(await screen.findByText(/never used/i)).toBeInTheDocument();
  });

  it('shows when a key was last used and when it runs out', async () => {
    mockedService.list.mockResolvedValue([
      makeKey({
        lastUsedAt: '2026-09-04T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
        // A scope this build of the front end has never heard of: the backend
        // can grow one before the UI knows its wording, and the chip should
        // still name it rather than render blank.
        scopes: ['vision:read', 'future:scope' as ApiKey['scopes'][number]]
      })
    ]);
    renderTab();

    expect(await screen.findByText(/last used/i)).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
    expect(screen.getByText('future:scope')).toBeInTheDocument();
  });

  it.each([
    ['active', {}],
    ['revoked', { revokedAt: '2026-09-05T00:00:00.000Z' }],
    ['expired', { expiresAt: '2020-01-01T00:00:00.000Z' }]
  ])('derives the %s state from the dates', async (status, overrides) => {
    mockedService.list.mockResolvedValue([makeKey(overrides)]);
    renderTab();

    expect(await screen.findByText(status)).toBeInTheDocument();
  });

  it('offers no revoke on an already-revoked key', async () => {
    mockedService.list.mockResolvedValue([makeKey({ revokedAt: '2026-09-05T00:00:00.000Z' })]);
    renderTab();

    await screen.findByText('Claude Code');
    expect(screen.queryByRole('button', { name: /revoke claude code/i })).not.toBeInTheDocument();
    // Deleting one is still how you tidy it away.
    expect(screen.getByRole('button', { name: /delete claude code/i })).toBeInTheDocument();
  });
});

describe('creating a key', () => {
  it('defaults to read-only, which is the grant that stays safe if it leaks', async () => {
    renderTab();
    await openCreateDialog();

    expect(screen.getByLabelText('vision:read')).toBeChecked();
    expect(screen.getByLabelText('dataset:read')).toBeChecked();
    expect(screen.getByLabelText('vision:write')).not.toBeChecked();
    expect(screen.getByLabelText('label:write')).not.toBeChecked();
  });

  it('offers every scope the backend defines, including analysis', async () => {
    // This list is a copy of backend-core's. When it drifts, the dialog quietly
    // stops offering a scope and nobody can issue a key that carries it.
    renderTab();
    await openCreateDialog();

    for (const scope of API_KEY_SCOPES) {
      expect(screen.getByLabelText(scope)).toBeInTheDocument();
    }
  });

  it('explains that recording analysis is not permission to change a run', async () => {
    // The distinction is the whole reason analysis has its own scope.
    renderTab();
    await openCreateDialog();

    expect(screen.getByText(/Cannot rename a project or change a run/)).toBeInTheDocument();
  });

  it('will not submit without a name', async () => {
    renderTab();
    await openCreateDialog();

    expect(screen.getByRole('button', { name: /create key/i })).toBeDisabled();
  });

  it('will not submit a key that would reach nothing', async () => {
    // It would authenticate and then be refused every route.
    renderTab();
    await openCreateDialog();

    fireEvent.change(screen.getByLabelText(/what is it for/i), { target: { value: 'Script' } });
    fireEvent.click(screen.getByLabelText('vision:read'));
    fireEvent.click(screen.getByLabelText('dataset:read'));

    expect(screen.getByRole('button', { name: /create key/i })).toBeDisabled();
  });

  it('sends the chosen name and scopes', async () => {
    renderTab();
    await openCreateDialog();

    fireEvent.change(screen.getByLabelText(/what is it for/i), { target: { value: 'Script' } });
    fireEvent.click(screen.getByLabelText('vision:write'));
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() =>
      expect(mockedService.create).toHaveBeenCalledWith({
        name: 'Script',
        scopes: ['vision:read', 'dataset:read', 'vision:write'],
        expiresInDays: undefined
      })
    );
  });

  it('sends a chosen expiry as a day count', async () => {
    renderTab();
    await openCreateDialog();

    fireEvent.change(screen.getByLabelText(/what is it for/i), { target: { value: 'Script' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /expires/i }));
    fireEvent.click(await screen.findByRole('option', { name: '90 days' }));
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() =>
      expect(mockedService.create).toHaveBeenCalledWith(
        expect.objectContaining({ expiresInDays: 90 })
      )
    );
  });

  it('forgets what was typed when the dialog is cancelled', async () => {
    // Reopening should not offer a half-filled form from a decision the user
    // already backed out of.
    renderTab();
    await openCreateDialog();

    fireEvent.change(screen.getByLabelText(/what is it for/i), { target: { value: 'Script' } });
    fireEvent.click(screen.getByLabelText('vision:write'));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    await openCreateDialog();
    expect(screen.getByLabelText(/what is it for/i)).toHaveValue('');
    expect(screen.getByLabelText('vision:write')).not.toBeChecked();
    expect(mockedService.create).not.toHaveBeenCalled();
  });

  it('shows the new key once, telling the user to copy it', async () => {
    renderTab();
    await openCreateDialog();

    fireEvent.change(screen.getByLabelText(/what is it for/i), { target: { value: 'Script' } });
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));

    expect(await screen.findByDisplayValue('vsn_live_0123456789ab_secret')).toBeInTheDocument();
    expect(screen.getByText(/copy this now/i)).toBeInTheDocument();
    // The connection details, so nobody has to go looking for the endpoint.
    expect(screen.getByText(/mcp\.visin\.eu\/mcp/)).toBeInTheDocument();
  });
});

describe('revealing a key', () => {
  it('fetches the token and shows it without the "copy this now" warning', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /show claude code/i }));

    expect(await screen.findByDisplayValue('vsn_live_0123456789ab_secret')).toBeInTheDocument();
    expect(mockedService.reveal).toHaveBeenCalledWith('k1');
    // Not a fresh key, so nothing is about to be lost.
    expect(screen.queryByText(/copy this now/i)).not.toBeInTheDocument();
  });

  it('copies to the clipboard on request', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /show claude code/i }));
    fireEvent.click(await screen.findByRole('button', { name: /copy api key/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('vsn_live_0123456789ab_secret'));
    expect(await screen.findByText(/copied to clipboard/i)).toBeInTheDocument();
  });

  it('closes, and does not remember the copied state next time', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /show claude code/i }));
    fireEvent.click(await screen.findByRole('button', { name: /copy api key/i }));
    await screen.findByText(/copied to clipboard/i);

    fireEvent.click(screen.getByRole('button', { name: /done/i }));
    // The dialog's exit transition keeps the rest of the page aria-hidden until
    // it finishes, so wait for the dialog itself to go rather than for the
    // token to disappear.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /show claude code/i }));
    await screen.findByDisplayValue('vsn_live_0123456789ab_secret');
    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument();
  });

  it('stays usable when the clipboard is denied', async () => {
    // The token is on screen and selectable, which is the fallback — a denied
    // permission is not worth an error state.
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    });

    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: /show claude code/i }));
    fireEvent.click(await screen.findByRole('button', { name: /copy api key/i }));

    expect(await screen.findByDisplayValue('vsn_live_0123456789ab_secret')).toBeInTheDocument();
    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument();
  });
});

describe('revoking and deleting', () => {
  it('confirms before revoking, and says what it will break', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /revoke claude code/i }));

    expect(await screen.findByText(/revoke claude code\?/i)).toBeInTheDocument();
    expect(screen.getByText(/stops working immediately/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mockedService.revoke).toHaveBeenCalledWith('k1'));
  });

  it('warns that deleting cannot be undone', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /delete claude code/i }));

    expect(await screen.findByText(/cannot be undone/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mockedService.remove).toHaveBeenCalledWith('k1'));
  });

  it('does nothing when the confirmation is dismissed', async () => {
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /delete claude code/i }));
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument());
    expect(mockedService.remove).not.toHaveBeenCalled();
  });

  it("surfaces auth-service's message when a mutation is refused", async () => {
    mockedService.revoke.mockRejectedValue(new Error('API key not found'));
    renderTab();

    fireEvent.click(await screen.findByRole('button', { name: /revoke claude code/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText('API key not found')).toBeInTheDocument();
  });
});
