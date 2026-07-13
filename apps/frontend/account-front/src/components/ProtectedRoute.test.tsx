import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from './ProtectedRoute';

const mockLogin = vi.fn();
let authState: { isAuthenticated: boolean; isLoading: boolean } = {
  isAuthenticated: false,
  isLoading: true,
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ ...authState, login: mockLogin }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProtectedRoute', () => {
  it('shows a loader while auth is being checked', () => {
    authState = { isAuthenticated: false, isLoading: true };
    render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('redirects to login when not authenticated', () => {
    authState = { isAuthenticated: false, isLoading: false };
    render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>
    );

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
  });

  it('renders children once authenticated', () => {
    authState = { isAuthenticated: true, isLoading: false };
    render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });
});
