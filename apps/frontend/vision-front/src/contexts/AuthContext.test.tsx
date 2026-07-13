import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ AUTH_SERVICE_URL: 'http://auth-service.test', AUTH_FRONT_URL: 'http://auth-front.test' })
}));

import { AuthProvider, useAuth } from './AuthContext';

const Probe = () => {
  const { isAuthenticated, isLoading, user, login } = useAuth();
  if (isLoading) return <div>loading</div>;
  return (
    <div>
      <span>{isAuthenticated ? `authed:${user?.email}` : 'anon'}</span>
      <button onClick={login}>login</button>
    </div>
  );
};

describe('AuthContext (real createAuthContext wiring)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('exposes an authenticated user once /auth/verify resolves', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, authenticated: true, user: { id: 'u1', email: 'a@b.com' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('authed:a@b.com')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('http://auth-service.test/auth/verify', expect.objectContaining({ credentials: 'include' }));
  });

  it('exposes an anonymous state on a 401 (not logged in)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument());
  });

  it('redirects to AUTH_FRONT_URL on login()', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'unauthorized' }), { status: 401 })));
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://app.test/page' },
      writable: true,
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'login' }));

    expect(window.location.href).toContain('http://auth-front.test');
  });
});
