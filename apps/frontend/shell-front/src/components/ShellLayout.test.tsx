import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { clearVisits, recordVisit } from '@visin/frontend-core';
import { MemoryRouter, useLocation } from 'react-router-dom';

const authState = {
  user: { id: 'u1', name: 'Jane Doe', email: 'jane@example.com' } as { id: string; name: string; email: string } | null,
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  signup: vi.fn(),
  logout: vi.fn(),
};
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));

const config: Record<string, string | undefined> = {};
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config }));

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
  clearVisits();
  vi.clearAllMocks();
  authState.isAuthenticated = true;
  authState.isLoading = false;
  for (const key of Object.keys(config)) delete config[key];
  config.VISION_FRONT_URL = 'https://vision.test';
});

describe('ShellLayout', () => {
  it('groups every app into Home, Projects, Data, Leaderboards and Labels, routed inside the page', () => {
    renderAt('/projects');

    for (const [name, href] of [
      ['Home', '/'],
      ['Projects', '/projects'],
      ['Data', '/datasets'],
      ['Leaderboards', '/leaderboards'],
      ['Labels', '/jobs'],
    ]) {
      expect(main().getByRole('link', { name })).toHaveAttribute('href', href);
    }
  });

  it('opens a signed-in session at Home, first in the menu', () => {
    renderAt('/');

    const groups = main().getAllByRole('link', { name: /^(Home|Projects|Data|Leaderboards|Labels)$/ });
    expect(groups.map((link) => link.textContent)).toEqual(['Home', 'Projects', 'Data', 'Leaderboards', 'Labels']);
    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(sectionBar('Home').getByRole('link', { name: 'For you' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps Explore one tab over from a member home', () => {
    renderAt('/explore');

    expect(main().getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'true');
    expect(sectionBar('Home').getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
  });

  it('takes the logo home', () => {
    renderAt('/jobs');

    fireEvent.click(main().getByRole('link', { name: 'Visin home' }));

    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('opens a visitor on Explore, with nothing in the menu that needs an account', () => {
    authState.isAuthenticated = false;
    renderAt('/');

    const groups = main().getAllByRole('link', { name: /^(Explore|Home|Projects|Data|Leaderboards|Labels)$/ });
    expect(groups.map((link) => link.textContent)).toEqual(['Explore', 'Projects', 'Data', 'Leaderboards']);
    expect(main().getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'true');
    expect(main().queryByRole('link', { name: 'Labels' })).not.toBeInTheDocument();
  });

  it('lists the public sections under Leaderboards', () => {
    renderAt('/leaderboards');

    expect(
      within(screen.getByRole('navigation', { name: 'Leaderboards' }))
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual(['Leaderboards', 'Models', 'Suites', 'Evaluations']);
  });

  it('marks the labeling group current, with no section bar for its single section', () => {
    renderAt('/jobs');

    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('navigation', { name: 'Labels' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
  });

  it('keeps Account sections out of the section bar elsewhere', () => {
    renderAt('/projects');

    expect(screen.queryByRole('navigation', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('frames each app as its standalone front did', () => {
    renderAt('/jobs');
    expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
  });

  it('leaves the title to Vision pages and to the workbench', () => {
    const { unmount } = renderAt('/projects');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    unmount();

    renderAt('/jobs/j1/work');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('draws no app header on a path no app owns', () => {
    renderAt('/nowhere');

    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('opens an Account section from the account menu without leaving the page', () => {
    renderAt('/projects');

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profile' }));

    expect(screen.getByTestId('path')).toHaveTextContent('/account/profile');
  });

  describe('top bar', () => {
    it('offers a visitor Sign in and Sign up, and the docs when the landing site is known', () => {
      authState.isAuthenticated = false;
      config.LANDING_FRONT_URL = 'https://landing.test/';
      renderAt('/projects');

      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

      expect(authState.login).toHaveBeenCalledTimes(1);
      expect(authState.signup).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://landing.test/docs');
      expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', 'https://landing.test/about');
    });

    it('links to no docs without a landing address, rather than guessing one', () => {
      authState.isAuthenticated = false;
      renderAt('/projects');

      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    });

    it('shows neither Sign in nor the account menu while the session is checked', () => {
      authState.isAuthenticated = false;
      authState.isLoading = true;
      renderAt('/projects');

      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
    });

    it('gives a member a New menu of what they can create', () => {
      renderAt('/datasets');

      fireEvent.click(screen.getByRole('button', { name: 'New' }));

      expect(screen.getByRole('menuitem', { name: 'Project' })).toHaveAttribute('href', '/projects?create=1');
      expect(screen.getByRole('menuitem', { name: 'Dataset' })).toHaveAttribute('href', '/datasets?create=1');
      expect(screen.getByRole('menuitem', { name: 'Labeling job' })).toHaveAttribute('href', '/jobs/new');
      expect(screen.getByRole('menuitem', { name: 'API key' })).toHaveAttribute('href', '/account/api-keys');
    });

    it('searches everything from the box, and from Ctrl+K, on the search page', () => {
      renderAt('/datasets');

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'night driving' } });
      fireEvent.submit(screen.getByRole('search'));

      expect(screen.getByTestId('path')).toHaveTextContent('/search');
    });

    it('offers the places this browser opened lately before anything is typed, at most six, and goes to one', () => {
      for (let index = 0; index < 8; index += 1) {
        recordVisit({ kind: index % 2 ? 'dataset' : 'project', id: `v${index}`, name: `Place ${index}`, path: `/p/${index}` }, 1000 + index);
      }
      renderAt('/account/groups');

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      const list = screen.getByRole('list', { name: 'Recently visited' });
      expect(within(list).getAllByRole('link')).toHaveLength(6);
      expect(within(list).getAllByRole('link')[0]).toHaveTextContent('Place 7Dataset');
      fireEvent.click(within(list).getByRole('link', { name: /Place 6/ }));

      expect(screen.getByTestId('path')).toHaveTextContent('/p/6');
    });

    it('has the search box whichever services are configured, since people and groups are found elsewhere', () => {
      delete config.VISION_FRONT_URL;
      renderAt('/datasets');

      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    });
  });
});
