import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../services/authService', () => ({
  authService: {
    checkAuth: vi.fn().mockResolvedValue({ authenticated: true, user: { id: 'u1', email: 'a@b.com' } }),
    redirectToLogin: vi.fn(),
    logout: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from './AuthContext';

const Probe = () => {
  const { isAuthenticated, user } = useAuth();
  return <div>{isAuthenticated ? `authed:${user?.email}` : 'anon'}</div>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AuthContext (real createAuthContext wiring)', () => {
  it('exposes the shared auth state to consumers', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('authed:a@b.com')).toBeInTheDocument());
  });
});
