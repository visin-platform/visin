import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authState = {
  user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' } as { id: string; name: string; email: string } | null,
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

import ShellLayout from './ShellLayout';

const Path = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderAt = (path: string) => {
  const result = render(
    <MemoryRouter initialEntries={[path]}>
      <ShellLayout>
        <Path />
      </ShellLayout>
    </MemoryRouter>
  );
  // Only the permanent desktop drawer; the mobile one portals out of <nav>.
  const nav = within(result.container.querySelector('nav')!);
  return { ...result, nav };
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAuthenticated = true;
});

describe('ShellLayout', () => {
  it('routes every section inside the page, with nothing linking to another domain', () => {
    const { nav } = renderAt('/projects');

    for (const [name, href] of [
      ['Projects', '/projects'],
      ['Trainings', '/trainings'],
      ['Datasets', '/datasets'],
      ['Jobs', '/jobs'],
      ['Bundles', '/bundles'],
    ]) {
      expect(nav.getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('highlights the section being shown, whichever app serves it', () => {
    const { nav } = renderAt('/jobs/j1');

    expect(nav.getByRole('link', { name: 'Jobs' }).className).toContain('Mui-selected');
    expect(nav.getByRole('link', { name: 'Projects' }).className).not.toContain('Mui-selected');
  });

  it('adds Account sections only while in Account', () => {
    expect(renderAt('/projects').nav.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
  });

  it('lists Account sections, and titles the page from them, on an Account route', () => {
    const { nav } = renderAt('/account/groups');

    expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('heading', { level: 4, name: 'Groups' })).toBeInTheDocument();
  });

  it('frames each app as its standalone front did', () => {
    renderAt('/jobs');
    expect(screen.getByRole('heading', { level: 4, name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByText('Label images and review annotation quality.')).toBeInTheDocument();
  });

  it('leaves the title to Vision pages and to the workbench', () => {
    const { unmount } = renderAt('/projects');
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    unmount();

    renderAt('/jobs/j1/work');
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
  });

  it('draws no app header on a path no app owns', () => {
    renderAt('/nowhere');

    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
  });

  it('opens Account from the user menu without leaving the page', () => {
    renderAt('/projects');

    fireEvent.click(screen.getAllByLabelText('open user menu')[0]);
    fireEvent.click(screen.getByText('Account'));

    expect(screen.getByTestId('path')).toHaveTextContent('/account');
  });

  it('offers Login to an anonymous visitor', () => {
    authState.isAuthenticated = false;
    renderAt('/projects');

    fireEvent.click(screen.getAllByText('Login')[0]);

    expect(authState.login).toHaveBeenCalled();
  });
});
