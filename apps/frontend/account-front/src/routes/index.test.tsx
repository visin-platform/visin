import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './index';

vi.mock('../components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../pages/AccountPage', () => ({ default: () => <div>account-page</div> }));
vi.mock('../components/LoginRedirect', () => ({ default: () => <div>login-redirect</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('AppRoutes', () => {
  it('redirects the index route to /account', () => {
    renderAt('/');
    expect(screen.getByText('account-page')).toBeInTheDocument();
  });

  it('renders the login route', () => {
    renderAt('/login');
    expect(screen.getByText('login-redirect')).toBeInTheDocument();
  });

  it('renders the protected account route', () => {
    renderAt('/account/profile');
    expect(screen.getByText('account-page')).toBeInTheDocument();
  });
});
