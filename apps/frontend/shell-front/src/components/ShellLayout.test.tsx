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

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ShellLayout>
        <Path />
      </ShellLayout>
    </MemoryRouter>
  );

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const sectionBar = (name: string) => within(screen.getByRole('navigation', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  authState.isAuthenticated = true;
});

describe('ShellLayout', () => {
  it('groups every app into Projects, Data and Labels, routed inside the page', () => {
    renderAt('/projects');

    for (const [name, href] of [
      ['Projects', '/projects'],
      ['Data', '/datasets'],
      ['Labels', '/jobs'],
    ]) {
      expect(main().getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('opens a signed-in session at Home, first in the menu', () => {
    renderAt('/');

    const groups = main().getAllByRole('link', { name: /^(Home|Projects|Data|Labels)$/ });
    expect(groups.map((link) => link.textContent)).toEqual(['Home', 'Projects', 'Data', 'Labels']);
    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
  });

  it('takes the logo home', () => {
    renderAt('/jobs');

    fireEvent.click(main().getByRole('link', { name: 'Visin home' }));

    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('offers no Home to an anonymous visitor', () => {
    authState.isAuthenticated = false;
    renderAt('/projects');

    expect(main().queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('lists bundles beside the jobs, routed inside the page', () => {
    renderAt('/bundles');

    expect(sectionBar('Labels').getByRole('link', { name: 'Jobs' })).toHaveAttribute('href', '/jobs');
    expect(sectionBar('Labels').getByRole('link', { name: 'Bundles' })).toHaveAttribute('aria-current', 'page');
    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('aria-current', 'true');
  });

  it('highlights the group being shown', () => {
    renderAt('/jobs/j1');

    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('aria-current', 'true');
    expect(main().getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Projects highlighted on the pages a project leads to', () => {
    for (const path of ['/comparisons/c1', '/benchmarks', '/visualizations/compare']) {
      const { unmount } = renderAt(path);
      expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true');
      unmount();
    }
  });

  it('lists Account sections, and titles the page from them, on an Account route', () => {
    renderAt('/account/groups');

    expect(sectionBar('Account').getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
    expect(screen.getByRole('heading', { level: 4, name: 'Groups' })).toBeInTheDocument();
  });

  it('keeps Account sections out of the section bar elsewhere', () => {
    renderAt('/projects');

    expect(screen.queryByRole('navigation', { name: 'Account' })).not.toBeInTheDocument();
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

  it('opens an Account section from the account menu without leaving the page', () => {
    renderAt('/projects');

    fireEvent.click(main().getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(screen.getByTestId('path')).toHaveTextContent('/account/profile');
  });

  it('offers Login to an anonymous visitor', () => {
    authState.isAuthenticated = false;
    renderAt('/projects');

    fireEvent.click(main().getByRole('button', { name: 'Login' }));

    expect(authState.login).toHaveBeenCalled();
  });
});
