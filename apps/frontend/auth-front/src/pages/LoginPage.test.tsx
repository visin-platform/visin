import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import LoginPage from './LoginPage';

const mockCheckAuth = vi.fn();
const mockLogout = vi.fn();

vi.mock('@visin/frontend-core', () => ({
  createAuthService: () => ({ checkAuth: mockCheckAuth, logout: mockLogout }),
}));

const mockInitializeGoogleSignIn = vi.fn();
vi.mock('../authFlow', () => ({
  initializeGoogleSignIn: (...args: unknown[]) => mockInitializeGoogleSignIn(...args),
}));

let mockConfig: Record<string, string | undefined> = {
  GOOGLE_CLIENT_ID: 'client-123',
  AUTH_SERVICE_URL: 'http://auth-api.test',
};
vi.mock('../config/useConfig', () => ({ useConfig: () => mockConfig }));

const setLocation = (search: string) => {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, search, href: `http://auth.test/${search}`, reload: vi.fn() },
    writable: true,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockConfig = { GOOGLE_CLIENT_ID: 'client-123', AUTH_SERVICE_URL: 'http://auth-api.test' };
  setLocation('');
  window.history.replaceState = vi.fn();
});

describe('LoginPage', () => {
  it('initializes Google Sign-In when the visitor is not authenticated', async () => {
    mockCheckAuth.mockResolvedValue({ authenticated: false, user: null });
    render(<LoginPage />);

    await waitFor(() =>
      expect(mockInitializeGoogleSignIn).toHaveBeenCalledWith('client-123', '/')
    );
    expect(screen.getByText('Sign In')).toBeInTheDocument();
  });

  it('shows LoggedInUser when already authenticated', async () => {
    mockCheckAuth.mockResolvedValue({
      authenticated: true,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    render(<LoginPage />);

    await waitFor(() => expect(screen.getByText('Welcome Back')).toBeInTheDocument());
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(mockInitializeGoogleSignIn).not.toHaveBeenCalled();
  });

  it('shows a configuration error when GOOGLE_CLIENT_ID is missing', async () => {
    mockConfig = { AUTH_SERVICE_URL: 'http://auth-api.test' };
    mockCheckAuth.mockResolvedValue({ authenticated: false, user: null });
    render(<LoginPage />);

    await waitFor(() =>
      expect(screen.getAllByText(/Google Client ID is not configured/).length).toBeGreaterThan(0)
    );
    expect(mockInitializeGoogleSignIn).not.toHaveBeenCalled();
  });

  it('reads redirect_uri from the query string and cleans up an error param', async () => {
    setLocation('?error=Invalid%20token&redirect_uri=%2Fvision');
    mockCheckAuth.mockResolvedValue({ authenticated: false, user: null });
    render(<LoginPage />);

    await waitFor(() => expect(screen.getAllByText('Invalid token').length).toBeGreaterThan(0));
    expect(window.history.replaceState).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockInitializeGoogleSignIn).toHaveBeenCalledWith('client-123', '/vision')
    );
  });

  it('surfaces an error when initializeGoogleSignIn throws synchronously', async () => {
    mockCheckAuth.mockResolvedValue({ authenticated: false, user: null });
    mockInitializeGoogleSignIn.mockImplementation(() => {
      throw new Error('boom');
    });
    render(<LoginPage />);

    await waitFor(() =>
      expect(screen.getAllByText('Failed to initialize Google Sign-In: boom').length).toBeGreaterThan(0)
    );
  });

  it('logs out and reloads on Sign out click', async () => {
    mockCheckAuth.mockResolvedValue({
      authenticated: true,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    mockLogout.mockResolvedValue(true);
    render(<LoginPage />);

    await waitFor(() => screen.getByText('Welcome Back'));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it('does not reload when logout fails', async () => {
    mockCheckAuth.mockResolvedValue({
      authenticated: true,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    mockLogout.mockResolvedValue(false);
    render(<LoginPage />);

    await waitFor(() => screen.getByText('Welcome Back'));
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('continues to the redirect_uri from the query string', async () => {
    setLocation('?redirect_uri=%2Fdashboard');
    mockCheckAuth.mockResolvedValue({
      authenticated: true,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    render(<LoginPage />);

    await waitFor(() => screen.getByText('Welcome Back'));
    fireEvent.click(screen.getByRole('button', { name: /continue to app/i }));

    expect(window.location.href).toBe('/dashboard');
  });

  it('defaults the continue redirect to "/" without a redirect_uri', async () => {
    mockCheckAuth.mockResolvedValue({
      authenticated: true,
      user: { name: 'Ada', email: 'ada@example.com' },
    });
    render(<LoginPage />);

    await waitFor(() => screen.getByText('Welcome Back'));
    fireEvent.click(screen.getByRole('button', { name: /continue to app/i }));

    expect(window.location.href).toBe('/');
  });
});
