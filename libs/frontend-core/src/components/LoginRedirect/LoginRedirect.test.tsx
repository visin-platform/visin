import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createLoginRedirect } from './LoginRedirect';

const mockNavigate = vi.fn();
const refresh = vi.fn();
const login = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const LoginRedirect = createLoginRedirect(() => ({ refresh, login }), { redirectTo: '/jobs' });

beforeEach(() => {
  vi.clearAllMocks();
});

const renderIt = (Component: () => ReactElement) =>
  render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>
  );

describe('createLoginRedirect', () => {
  it('shows a loader, then navigates to the configured route on success', async () => {
    refresh.mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    renderIt(LoginRedirect);

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/jobs', { replace: true }));
  });

  it('honours each app\'s own redirectTo rather than a shared default', async () => {
    refresh.mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    const AccountRedirect = createLoginRedirect(() => ({ refresh, login }), { redirectTo: '/account' });

    renderIt(AccountRedirect);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/account', { replace: true }));
  });

  it('shows an error and a retry button when the auth check reports failure', async () => {
    refresh.mockResolvedValue({ authenticated: false, user: null });
    renderIt(LoginRedirect);

    await waitFor(() =>
      expect(screen.getByText('Authentication failed. Please try logging in again.')).toBeInTheDocument()
    );
    expect(mockNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /try login again/i }));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('shows an error when refresh throws', async () => {
    refresh.mockRejectedValue(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderIt(LoginRedirect);

    await waitFor(() =>
      expect(screen.getByText('Authentication check failed. Please try logging in again.')).toBeInTheDocument()
    );
    expect(consoleError).toHaveBeenCalled();
  });
});
