import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';

const authService = vi.hoisted(() => ({ checkAuth: vi.fn(), logout: vi.fn() }));
vi.mock('@visin/frontend-core', async () => {
  const actual = await vi.importActual<typeof import('@visin/frontend-core')>('@visin/frontend-core');
  return { ...actual, createAuthService: () => authService };
});

const api = vi.hoisted(() => ({
  getSetupStatus: vi.fn(),
  setupFirstUser: vi.fn(),
  register: vi.fn(),
  login: vi.fn()
}));
vi.mock('../services/authApi', () => api);

const initializeGoogleSignIn = vi.hoisted(() => vi.fn());
vi.mock('../authFlow', () => ({ initializeGoogleSignIn }));

const config = vi.hoisted(() => ({
  value: { AUTH_SERVICE_URL: 'http://auth.test', GOOGLE_CLIENT_ID: 'gid' } as Record<string, string | undefined>
}));
vi.mock('../config/useConfig', () => ({ useConfig: () => config.value }));

const setLocation = (search = '') => {
  Object.defineProperty(window, 'location', {
    value: { search, href: `http://auth-front.test/${search}`, origin: 'http://auth-front.test', reload: vi.fn() },
    writable: true
  });
};

const fill = (values: Record<string, string>) => {
  for (const [field, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${field}`, 'i')), { target: { value } });
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  config.value = { AUTH_SERVICE_URL: 'http://auth.test', GOOGLE_CLIENT_ID: 'gid' };
  authService.checkAuth.mockResolvedValue({ authenticated: false, user: null });
  api.getSetupStatus.mockResolvedValue({ needsSetup: false, googleEnabled: true });
  setLocation();
  window.history.replaceState = vi.fn();
});

describe('LoginPage first run', () => {
  it('offers setup instead of login when the instance has no users', async () => {
    api.getSetupStatus.mockResolvedValue({ needsSetup: true, googleEnabled: true });
    render(<LoginPage />);

    expect(await screen.findByRole('heading', { name: /create the owner account/i })).toBeInTheDocument();
    expect(screen.getByText(/this instance has no users yet/i)).toBeInTheDocument();
    // There is nothing to sign into yet, so neither Google nor the
    // register/sign-in toggle is offered.
    expect(document.getElementById('google-signin-button')).toBeNull();
    expect(screen.queryByRole('button', { name: /create one/i })).not.toBeInTheDocument();
  });

  it('creates the owner account and continues to the redirect target', async () => {
    api.getSetupStatus.mockResolvedValue({ needsSetup: true, googleEnabled: false });
    api.setupFirstUser.mockResolvedValue(undefined);
    setLocation('?redirect_uri=http%3A%2F%2Fapp.test%2Fprojects');
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /create the owner account/i });

    fill({ Email: 'owner@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create owner account' }));

    await waitFor(() =>
      expect(api.setupFirstUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'owner@example.com', password: 'a-strong-password' })
      )
    );
    await waitFor(() => expect(window.location.href).toBe('http://app.test/projects'));
  });

  it('surfaces a setup failure without navigating', async () => {
    api.getSetupStatus.mockResolvedValue({ needsSetup: true, googleEnabled: false });
    api.setupFirstUser.mockRejectedValue(new Error('Setup has already been completed'));
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /create the owner account/i });

    fill({ Email: 'owner@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create owner account' }));

    expect(await screen.findByText('Setup has already been completed')).toBeInTheDocument();
  });
});

describe('LoginPage password sign-in', () => {
  it('signs in and follows the redirect target', async () => {
    api.login.mockResolvedValue(undefined);
    setLocation('?redirect_uri=http%3A%2F%2Fapp.test%2Fjobs');
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    fill({ Email: 'ada@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(api.login).toHaveBeenCalledWith('ada@example.com', 'a-strong-password'));
    await waitFor(() => expect(window.location.href).toBe('http://app.test/jobs'));
  });

  it('defaults to / when no redirect target was given', async () => {
    api.login.mockResolvedValue(undefined);
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    fill({ Email: 'ada@example.com', Password: 'pw' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(window.location.href).toBe('/'));
  });

  it('shows the server message when sign-in is rejected', async () => {
    api.login.mockRejectedValue(new Error('Incorrect email or password'));
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    fill({ Email: 'ada@example.com', Password: 'wrong' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Incorrect email or password')).toBeInTheDocument();
  });

  it('does not enforce the length floor on an existing password', async () => {
    api.login.mockResolvedValue(undefined);
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    // Short, but it may predate the policy — the server is the authority.
    fill({ Email: 'ada@example.com', Password: 'short' });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(api.login).toHaveBeenCalled());
  });
});

describe('LoginPage registration', () => {
  const goToRegister = async () => {
    await screen.findByRole('heading', { name: /^sign in$/i });
    fireEvent.click(screen.getByRole('button', { name: /create one/i }));
    await screen.findByRole('heading', { name: /create an account/i });
  };

  it('signs the new account straight in', async () => {
    // No approval step: what a user can reach is decided by group membership.
    api.register.mockResolvedValue(undefined);
    setLocation('?redirect_uri=http%3A%2F%2Fapp.test%2Fprojects');
    render(<LoginPage />);
    await goToRegister();

    fill({ Email: 'new@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(window.location.href).toBe('http://app.test/projects'));
  });

  it('passes the optional name fields through', async () => {
    api.register.mockResolvedValue(undefined);
    render(<LoginPage />);
    await goToRegister();

    fill({ 'First name': 'Ada', 'Last name': 'Lovelace', Email: 'new@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(api.register).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'Ada', lastName: 'Lovelace' })
      )
    );
  });

  it('keeps submit disabled until the password floor is met', async () => {
    render(<LoginPage />);
    await goToRegister();

    fill({ Email: 'new@example.com', Password: 'short' });

    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled();
  });

  it('shows the server message when registration is rejected', async () => {
    api.register.mockRejectedValue(new Error('An account with that email already exists'));
    render(<LoginPage />);
    await goToRegister();

    fill({ Email: 'taken@example.com', Password: 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('An account with that email already exists')).toBeInTheDocument();
  });
});

describe('LoginPage Google availability', () => {
  it('initialises Google sign-in when both sides have it configured', async () => {
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    await waitFor(() => expect(initializeGoogleSignIn).toHaveBeenCalledWith('gid', '/'));
    expect(document.getElementById('google-signin-button')).not.toBeNull();
  });

  it('hides Google entirely when the server has no client id', async () => {
    api.getSetupStatus.mockResolvedValue({ needsSetup: false, googleEnabled: false });
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    // Password sign-in still works, so a missing Google config is not an error.
    expect(document.getElementById('google-signin-button')).toBeNull();
    expect(initializeGoogleSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('hides Google when the front has no client id, even if the server allows it', async () => {
    config.value = { AUTH_SERVICE_URL: 'http://auth.test', GOOGLE_CLIENT_ID: '' };
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /^sign in$/i });

    expect(initializeGoogleSignIn).not.toHaveBeenCalled();
  });

  it('reports a Google initialisation failure', async () => {
    initializeGoogleSignIn.mockImplementation(() => {
      throw new Error('SDK blocked');
    });
    render(<LoginPage />);

    expect(await screen.findByText(/SDK blocked/)).toBeInTheDocument();
  });
});

describe('LoginPage session handling', () => {
  const signedIn = () =>
    authService.checkAuth.mockResolvedValue({
      authenticated: true,
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' }
    });

  it('shows the signed-in view and skips the setup probe', async () => {
    signedIn();
    render(<LoginPage />);

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(api.getSetupStatus).not.toHaveBeenCalled();
  });

  it('continues to the redirect target', async () => {
    signedIn();
    setLocation('?redirect_uri=http%3A%2F%2Fapp.test%2Fdatasets');
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /welcome back/i });

    fireEvent.click(screen.getByRole('button', { name: /continue to app/i }));

    expect(window.location.href).toBe('http://app.test/datasets');
  });

  it('logs out and reloads', async () => {
    signedIn();
    authService.logout.mockResolvedValue(true);
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /welcome back/i });

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
  });

  it('stays put when logout fails', async () => {
    signedIn();
    authService.logout.mockResolvedValue(false);
    render(<LoginPage />);
    await screen.findByRole('heading', { name: /welcome back/i });

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => expect(authService.logout).toHaveBeenCalled());
    expect(window.location.reload).not.toHaveBeenCalled();
  });
});

describe('LoginPage error handling', () => {
  it('surfaces an error passed in the query string and cleans the URL', async () => {
    setLocation('?error=Account%20not%20approved');
    render(<LoginPage />);

    expect(await screen.findByText('Account not approved')).toBeInTheDocument();
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it('still shows the login form when the status probe fails', async () => {
    api.getSetupStatus.mockRejectedValue(new Error('auth-service unreachable'));
    render(<LoginPage />);

    // Better a form that fails informatively on submit than a blank page.
    expect(await screen.findByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
  });
});
