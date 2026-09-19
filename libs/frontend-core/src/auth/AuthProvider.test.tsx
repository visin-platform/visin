import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { createAuthContext } from './AuthProvider';
import type { AuthService, AuthUser } from './authService';

const testUser: AuthUser = { id: 'u1', email: 'u1@test.dev', name: 'Test User' };

const makeAuthService = (overrides: Partial<AuthService> = {}): AuthService =>
  ({
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, user: testUser }),
    getCurrentUser: vi.fn(),
    getProfile: vi.fn(),
    isAuthenticated: vi.fn(),
    logout: vi.fn().mockResolvedValue(true),
    redirectToLogin: vi.fn(),
    ...overrides
  }) as unknown as AuthService;

function Consumer({ useAuth }: { useAuth: ReturnType<typeof createAuthContext>['useAuth'] }) {
  const { user, isAuthenticated, isLoading, login, logout, refresh } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
      <span data-testid="user">{user ? user.name : 'none'}</span>
      <button onClick={login}>login</button>
      <button onClick={() => void logout()}>logout</button>
      <button onClick={() => void refresh()}>refresh</button>
    </div>
  );
}

const renderWithProvider = (service: AuthService) => {
  const { AuthProvider, useAuth } = createAuthContext(service);
  render(
    <AuthProvider>
      <Consumer useAuth={useAuth} />
    </AuthProvider>
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createAuthContext', () => {
  it('starts loading, then exposes the checked-in user', async () => {
    const service = makeAuthService();
    renderWithProvider(service);

    expect(screen.getByTestId('loading')).toHaveTextContent('true');

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    expect(service.checkAuth).toHaveBeenCalled();
  });

  it('exposes an unauthenticated state when the session check finds no user', async () => {
    renderWithProvider(
      makeAuthService({
        checkAuth: vi.fn().mockResolvedValue({ authenticated: false, user: null })
      } as Partial<AuthService>)
    );

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('login delegates to authService.redirectToLogin', async () => {
    const service = makeAuthService();
    renderWithProvider(service);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));

    act(() => screen.getByRole('button', { name: 'login' }).click());

    expect(service.redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it('logout calls the service, clears the user, and reloads the page', async () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true
    });
    const service = makeAuthService();
    renderWithProvider(service);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Test User'));

    await act(async () => screen.getByRole('button', { name: 'logout' }).click());

    expect(service.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('none'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('refresh re-runs the session check and updates the shared state', async () => {
    const checkAuth = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: false, user: null })
      .mockResolvedValueOnce({ authenticated: true, user: testUser });
    renderWithProvider(makeAuthService({ checkAuth } as Partial<AuthService>));
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('user')).toHaveTextContent('none');

    await act(async () => screen.getByRole('button', { name: 'refresh' }).click());

    expect(checkAuth).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Test User'));
  });

  // shell-front mounts a remote's provider on every visit to that app; its
  // protected pages must not flash "Checking authentication..." each time.
  it('starts a remounted provider from the last known session, and still re-checks it', async () => {
    const service = makeAuthService();
    const { AuthProvider, useAuth } = createAuthContext(service);
    const tree = (
      <AuthProvider>
        <Consumer useAuth={useAuth} />
      </AuthProvider>
    );
    const { unmount } = render(tree);
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Test User'));
    unmount();

    render(tree);

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    await waitFor(() => expect(service.checkAuth).toHaveBeenCalledTimes(2));
  });

  describe('returning to the app', () => {
    const HOUR = 60 * 60 * 1000;
    let now: number;

    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };

    const renderSignedIn = async (service: AuthService) => {
      renderWithProvider(service);
      await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Test User'));
    };

    beforeEach(() => {
      now = 1_000_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
    });

    afterEach(() => {
      Reflect.deleteProperty(document, 'visibilityState');
    });

    it('re-checks a session last checked over an hour ago, and applies the answer', async () => {
      const checkAuth = vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true, user: testUser })
        .mockResolvedValueOnce({ authenticated: false, user: null });
      await renderSignedIn(makeAuthService({ checkAuth }));

      now += HOUR + 1;
      setVisibility('visible');

      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('false'));
      expect(checkAuth).toHaveBeenCalledTimes(2);
    });

    it('does not re-check a session checked within the hour', async () => {
      const service = makeAuthService();
      await renderSignedIn(service);

      now += HOUR - 1;
      setVisibility('visible');

      expect(service.checkAuth).toHaveBeenCalledTimes(1);
    });

    it('ignores the app being hidden', async () => {
      const service = makeAuthService();
      await renderSignedIn(service);

      now += HOUR + 1;
      setVisibility('hidden');

      expect(service.checkAuth).toHaveBeenCalledTimes(1);
    });

    it('keeps the session when the re-check could not reach the server', async () => {
      const checkAuth = vi
        .fn()
        .mockResolvedValueOnce({ authenticated: true, user: testUser })
        .mockResolvedValueOnce({ authenticated: false, user: null, failed: true });
      await renderSignedIn(makeAuthService({ checkAuth }));

      now += HOUR + 1;
      setVisibility('visible');

      await waitFor(() => expect(checkAuth).toHaveBeenCalledTimes(2));
      expect(screen.getByTestId('user')).toHaveTextContent('Test User');
    });
  });

  it('useAuth throws when used outside its AuthProvider', () => {
    const { useAuth } = createAuthContext(makeAuthService());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumer useAuth={useAuth} />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );

    consoleError.mockRestore();
  });
});
