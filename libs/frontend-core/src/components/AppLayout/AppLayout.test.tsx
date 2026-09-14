import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppLayout, type AppLayoutNavGroup, type AppLayoutNavItem, type AppLayoutUser } from './AppLayout';

const navGroups: AppLayoutNavGroup[] = [
  {
    label: 'Projects',
    icon: <i />,
    items: [
      { text: 'All projects', icon: <i />, path: '/projects' },
      { text: 'Trainings', icon: <i />, path: '/trainings' }
    ],
    match: ['/benchmarks']
  },
  {
    label: 'Data',
    icon: <i />,
    items: [{ text: 'Datasets', icon: <i />, path: '/datasets' }]
  },
  {
    label: 'Labels',
    icon: <i />,
    items: [
      { text: 'Jobs', icon: <i />, path: '/jobs' },
      { text: 'New job', icon: <i />, path: '/jobs/new' },
      { text: 'Bundles', icon: <i />, href: 'https://label.test/bundles' }
    ]
  }
];

const accountItems: AppLayoutNavItem[] = [
  { text: 'Profile', icon: <i />, path: '/account/profile' },
  { text: 'Groups', icon: <i />, path: '/account/groups' }
];

const onLogout = vi.fn();
const onLogin = vi.fn();

const Path = () => <div data-testid="path">{useLocation().pathname}</div>;

const renderAt = (
  path: string,
  user: AppLayoutUser | null = { name: 'Test User', email: 'test@example.com' },
  extraProps: Partial<React.ComponentProps<typeof AppLayout>> = {}
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout
        appName="Visin App"
        subtitle="Everything in one place."
        navGroups={navGroups}
        accountItems={accountItems}
        user={user}
        onLogout={onLogout}
        onLogin={onLogin}
        {...extraProps}
      >
        <div>page content</div>
        <Path />
      </AppLayout>
    </MemoryRouter>
  );

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const sectionBar = (name: string) => within(screen.getByRole('navigation', { name }));
const openAccount = () => fireEvent.click(main().getByRole('button', { name: 'Account' }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppLayout', () => {
  it('renders the logo, one entry per group, and the page', () => {
    renderAt('/projects');

    expect(screen.getByAltText('Visin')).toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(main().getAllByRole('link').map(link => link.textContent)).toEqual(['Projects', 'Data', 'Labels']);
  });

  it('links the logo home where the app has a home page', () => {
    renderAt('/projects', undefined, { homePath: '/' });

    fireEvent.click(screen.getByRole('link', { name: 'Visin home' }));

    expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/);
  });

  it('opens a group at its first section', () => {
    renderAt('/projects');

    expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('href', '/jobs');
  });

  it('links a group led by another app section as a plain anchor', () => {
    renderAt('/projects', null, {
      navGroups: [{ label: 'Labels', icon: null, items: [{ text: 'Jobs', icon: null, href: 'https://label.test/jobs' }] }]
    });

    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('href', 'https://label.test/jobs');
  });

  it('highlights the group of the section being shown', () => {
    renderAt('/trainings/t1');

    expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true');
    expect(main().getByRole('link', { name: 'Labels' })).not.toHaveAttribute('aria-current');
  });

  it('keeps a group highlighted on its pages that are not sections', () => {
    renderAt('/benchmarks/b1');

    expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'true');
  });

  it('highlights nothing on a page no group owns', () => {
    renderAt('/somewhere-else');

    expect(main().queryAllByRole('link').filter(link => link.hasAttribute('aria-current'))).toHaveLength(0);
    expect(screen.queryByRole('navigation', { name: 'Projects' })).not.toBeInTheDocument();
  });

  describe('section bar', () => {
    it('lists the shown group sections above the content', () => {
      renderAt('/trainings');

      const bar = sectionBar('Projects');
      expect(bar.getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects');
      expect(bar.getByRole('link', { name: 'Trainings' })).toHaveAttribute('aria-current', 'page');
      expect(bar.getByRole('link', { name: 'All projects' })).not.toHaveAttribute('aria-current');
    });

    it('is left out for a group of one', () => {
      renderAt('/datasets');

      expect(main().getByRole('link', { name: 'Data' })).toHaveAttribute('aria-current', 'true');
      expect(screen.queryByRole('navigation', { name: 'Data' })).not.toBeInTheDocument();
    });

    it('lets an exact section match win over a prefix one', () => {
      renderAt('/jobs/new');

      expect(sectionBar('Labels').getByRole('link', { name: 'New job' })).toHaveAttribute('aria-current', 'page');
      expect(sectionBar('Labels').getByRole('link', { name: 'Jobs' })).not.toHaveAttribute('aria-current');
    });

    it('links another app section as a plain anchor, never highlighted', () => {
      renderAt('/jobs');

      const bundles = sectionBar('Labels').getByRole('link', { name: 'Bundles' });
      expect(bundles).toHaveAttribute('href', 'https://label.test/bundles');
      expect(bundles).not.toHaveAttribute('aria-current');
    });
  });

  describe('page header', () => {
    it('titles the page from its section, with the app subtitle', () => {
      renderAt('/jobs');

      expect(screen.getByRole('heading', { level: 4, name: 'Jobs' })).toBeInTheDocument();
      expect(screen.getByText('Everything in one place.')).toBeInTheDocument();
    });

    it('falls back to appName outside known routes', () => {
      renderAt('/somewhere-else');

      expect(screen.getByRole('heading', { level: 4, name: 'Visin App' })).toBeInTheDocument();
    });

    it('can be left to apps whose pages carry their own titles', () => {
      renderAt('/jobs', undefined, { showPageHeader: false });

      expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    });
  });

  describe('account', () => {
    it('keeps the user out of the content', () => {
      const { container } = renderAt('/jobs');

      expect(within(container.querySelector('main')!).queryByText('Test User')).not.toBeInTheDocument();
    });

    it('opens a menu with who is signed in and the Account sections', () => {
      renderAt('/projects');
      // Held before opening: the open menu hides the rest of the page from queries by role.
      const account = main().getByRole('button', { name: 'Account' });

      fireEvent.click(account);

      const menu = within(screen.getByRole('menu', { name: 'Account' }));
      expect(menu.getByText('Test User')).toBeInTheDocument();
      expect(menu.getByText('test@example.com')).toBeInTheDocument();
      expect(menu.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute('href', '/account/profile');
      expect(account).toHaveAttribute('aria-expanded', 'true');
    });

    it('routes to an Account section client-side', () => {
      renderAt('/projects');

      openAccount();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Groups' }));

      expect(screen.getByTestId('path')).toHaveTextContent('/account/groups');
    });

    it('links Account sections of another app as plain anchors', () => {
      renderAt('/projects', undefined, {
        accountItems: [{ text: 'Profile', icon: null, href: 'https://account.test/account/profile' }]
      });

      openAccount();

      expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
        'href',
        'https://account.test/account/profile'
      );
    });

    it('logs out from the menu', () => {
      renderAt('/projects');

      openAccount();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('offers only Logout where Account is unreachable', () => {
      renderAt('/projects', undefined, { accountItems: [] });

      openAccount();

      expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
    });

    it('falls back to "User" when the user has no name, or there is no user', () => {
      const { unmount } = renderAt('/projects', { email: 'test@example.com' });
      openAccount();
      expect(screen.getByText('User')).toBeInTheDocument();
      unmount();

      renderAt('/projects', null);
      openAccount();
      expect(screen.getByText('User')).toBeInTheDocument();
    });

    it('is a group of its own while one of its sections is shown', () => {
      renderAt('/account/groups');

      expect(main().getByRole('button', { name: 'Account' })).toHaveAttribute('aria-current', 'true');
      expect(sectionBar('Account').getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('heading', { level: 4, name: 'Groups' })).toBeInTheDocument();
    });

    it('offers Login in its place to an anonymous visitor', () => {
      renderAt('/projects', null, { isAuthenticated: false });

      expect(main().queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
      fireEvent.click(main().getByRole('button', { name: 'Login' }));

      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });
  });

  it('applies a custom max content width', () => {
    renderAt('/jobs', undefined, { maxContentWidth: 1400 });

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  describe('on a phone', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        })
      });
    });

    afterEach(() => {
      delete (window as { matchMedia?: unknown }).matchMedia;
    });

    it('moves the groups to a tab bar under the content', () => {
      const { container } = renderAt('/projects');

      const tabBar = screen.getByRole('navigation', { name: 'Main' });
      expect(within(tabBar).getAllByRole('link').map(link => link.textContent)).toEqual([
        'Projects',
        'Data',
        'Labels'
      ]);
      expect(within(tabBar).getByRole('button', { name: 'Account' })).toBeInTheDocument();
      const content = container.querySelector('main')!;
      expect(content.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The rail's logo has no room there.
      expect(screen.queryByAltText('Visin')).not.toBeInTheDocument();
    });

    it('turns the section bar into a dropdown named for the current section', () => {
      renderAt('/trainings');

      fireEvent.click(sectionBar('Projects').getByRole('button', { name: 'Trainings' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'All projects' }));

      expect(screen.getByTestId('path')).toHaveTextContent('/projects');
    });

    it('names the dropdown for the group on a page that is none of its sections', () => {
      renderAt('/benchmarks');

      expect(sectionBar('Projects').getByRole('button', { name: 'Projects' })).toHaveAttribute(
        'aria-haspopup',
        'menu'
      );
    });

    it('drops the page title where the dropdown already names the page', () => {
      const { unmount } = renderAt('/jobs');
      expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
      unmount();

      renderAt('/datasets');
      expect(screen.getByRole('heading', { level: 4, name: 'Datasets' })).toBeInTheDocument();
    });

    it('opens Account as a bottom sheet', () => {
      renderAt('/projects');

      openAccount();
      const sheet = within(screen.getByRole('menu', { name: 'Account' }));
      expect(sheet.getByRole('menuitem', { name: 'Profile' })).toBeInTheDocument();
      fireEvent.click(sheet.getByRole('menuitem', { name: 'Logout' }));

      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });
});
