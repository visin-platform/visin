import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createProtectedRoute, type ProtectedRouteAuth } from './ProtectedRoute';

const login = vi.fn();
let authState: ProtectedRouteAuth = { isAuthenticated: false, isLoading: true, login };

const ProtectedRoute = createProtectedRoute(() => authState);

beforeEach(() => {
  vi.clearAllMocks();
});

const renderGuard = () =>
  render(
    <ProtectedRoute>
      <div>secret</div>
    </ProtectedRoute>
  );

describe('createProtectedRoute', () => {
  it('shows a loader while auth is being checked', () => {
    authState = { isAuthenticated: false, isLoading: true, login };
    renderGuard();

    expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('redirects to login when not authenticated', () => {
    authState = { isAuthenticated: false, isLoading: false, login };
    renderGuard();

    expect(login).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Redirecting to login...')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children once authenticated', () => {
    authState = { isAuthenticated: true, isLoading: false, login };
    renderGuard();

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('uses the hook it was built with, so each app keeps its own auth context', () => {
    const otherLogin = vi.fn();
    const OtherGuard = createProtectedRoute(() => ({
      isAuthenticated: false,
      isLoading: false,
      login: otherLogin
    }));

    render(
      <OtherGuard>
        <div>other</div>
      </OtherGuard>
    );

    expect(otherLogin).toHaveBeenCalledTimes(1);
    expect(login).not.toHaveBeenCalled();
  });
});
