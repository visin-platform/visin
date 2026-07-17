import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from './index';

vi.mock('../components/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../pages/JobsPage', () => ({ default: () => <div>jobs-page</div> }));
vi.mock('../pages/JobDetailPage', () => ({ default: () => <div>job-detail-page</div> }));
vi.mock('../pages/WorkbenchPage', () => ({ default: () => <div>workbench-page</div> }));
vi.mock('../pages/BundlesPage', () => ({ default: () => <div>bundles-page</div> }));
vi.mock('../pages/NewJobPage', () => ({ default: () => <div>new-job-page</div> }));
vi.mock('../components/LoginRedirect', () => ({ default: () => <div>login-redirect</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>
  );

describe('AppRoutes', () => {
  it('redirects the index route to /jobs', () => {
    renderAt('/');
    expect(screen.getByText('jobs-page')).toBeInTheDocument();
  });

  it('renders the login route', () => {
    renderAt('/login');
    expect(screen.getByText('login-redirect')).toBeInTheDocument();
  });

  it('routes jobs, wizard, detail, workbench, and bundles', () => {
    renderAt('/jobs');
    expect(screen.getByText('jobs-page')).toBeInTheDocument();

    renderAt('/jobs/new');
    expect(screen.getByText('new-job-page')).toBeInTheDocument();

    renderAt('/jobs/abc');
    expect(screen.getByText('job-detail-page')).toBeInTheDocument();

    renderAt('/jobs/abc/work');
    expect(screen.getByText('workbench-page')).toBeInTheDocument();

    renderAt('/bundles');
    expect(screen.getByText('bundles-page')).toBeInTheDocument();
  });
});
