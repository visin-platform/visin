import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoginRedirect from './LoginRedirect';

const mockNavigate = vi.fn();
const mockRefresh = vi.fn();
const mockLogin = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ refresh: mockRefresh, login: mockLogin }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

const renderIt = () =>
  render(
    <MemoryRouter>
      <LoginRedirect />
    </MemoryRouter>
  );

describe('LoginRedirect', () => {
  it('shows a loader, then navigates to /jobs on success', async () => {
    mockRefresh.mockResolvedValue({ authenticated: true, user: { id: 'u1' } });
    renderIt();

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/jobs', { replace: true }));
  });

  it('shows an error and a retry button when auth check reports failure', async () => {
    mockRefresh.mockResolvedValue({ authenticated: false, user: null });
    renderIt();

    await waitFor(() =>
      expect(screen.getByText('Authentication failed. Please try logging in again.')).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /try login again/i }));
    expect(mockLogin).toHaveBeenCalledTimes(1);
  });

  it('shows an error when refresh throws', async () => {
    mockRefresh.mockRejectedValue(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderIt();

    await waitFor(() =>
      expect(screen.getByText('Authentication check failed. Please try logging in again.')).toBeInTheDocument()
    );
    expect(consoleError).toHaveBeenCalled();
  });
});
