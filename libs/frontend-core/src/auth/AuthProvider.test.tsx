import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('useAuth throws when used outside its AuthProvider', () => {
    const { useAuth } = createAuthContext(makeAuthService());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumer useAuth={useAuth} />)).toThrow(
      'useAuth must be used within an AuthProvider'
    );

    consoleError.mockRestore();
  });
});
