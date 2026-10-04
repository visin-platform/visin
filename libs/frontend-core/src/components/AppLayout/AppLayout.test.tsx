import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AppLayout, type AppLayoutNavGroup, type AppLayoutNavItem, type AppLayoutUser } from './AppLayout';
import { VisinThemeProvider } from '../ColorMode';

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
const bar = (container: HTMLElement) => within(container.querySelector('header')!);
const sectionBar = (name: string) => within(screen.getByRole('navigation', { name }));
const openAccount = () => fireEvent.click(screen.getByRole('button', { name: 'Account' }));

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

  describe('app bar', () => {
    it('names the area being shown, with its sections as tabs', () => {
      const { container } = renderAt('/jobs');

      const header = container.querySelector('header')!;
      expect(header).toHaveTextContent('Labels');
      expect(within(header).getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
    });

    it('names the app outside any area', () => {
      const { container } = renderAt('/somewhere-else');

      expect(container.querySelector('header')).toHaveTextContent('Visin App');
    });
  });

  describe('page header', () => {
    it('titles the page from its section', () => {
      renderAt('/jobs');

      expect(screen.getByRole('heading', { level: 1, name: 'Jobs' })).toBeInTheDocument();
    });

    it('falls back to appName outside known routes', () => {
      renderAt('/somewhere-else');

      expect(screen.getByRole('heading', { level: 1, name: 'Visin App' })).toBeInTheDocument();
    });

    it('can be left to apps whose pages carry their own titles', () => {
      renderAt('/jobs', undefined, { showPageHeader: false });

      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
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
      const account = screen.getByRole('button', { name: 'Account' });

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

      expect(sectionBar('Account').getByRole('link', { name: 'Groups' })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    });

    it('has no appearance item: that moved to the top bar, where a visitor can reach it too', () => {
      renderAt('/projects');

      openAccount();

      expect(screen.queryByRole('menuitem', { name: /Appearance/ })).not.toBeInTheDocument();
    });

    it('ends in Logout without a stray divider where Account has no sections', () => {
      renderAt('/projects', undefined, { accountItems: [] });

      openAccount();

      expect(screen.getAllByRole('separator')).toHaveLength(1);
      expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeInTheDocument();
    });

    it('is in the top bar, leaving the rail to places', () => {
      const { container } = renderAt('/projects');

      expect(main().queryByRole('button')).not.toBeInTheDocument();
      expect(bar(container).getByRole('button', { name: 'Account' })).toBeInTheDocument();
    });
  });

  describe('for a visitor', () => {
    const visitor = (extraProps: Partial<React.ComponentProps<typeof AppLayout>> = {}) =>
      renderAt('/projects', null, { isAuthenticated: false, ...extraProps });

    it('offers Sign in in place of the account menu', () => {
      visitor();

      expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      expect(onLogin).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });

    it('offers Sign up where the app can send one', () => {
      const onSignup = vi.fn();
      visitor({ onSignup });

      fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));

      expect(onSignup).toHaveBeenCalledTimes(1);
    });

    it('has no Sign up where the app cannot', () => {
      visitor();

      expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
    });

    it('gets the links to the docs beside Sign in, and no New menu', () => {
      visitor({
        visitorLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }],
        createItems: [{ text: 'Project', icon: null, path: '/projects?new=1' }]
      });

      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://docs.test/docs');
      expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });

    it('shows neither Sign in nor the account menu while the session is being checked', () => {
      visitor({ authPending: true, onSignup: vi.fn() });

      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
    });

    it('gets no Sign in or links while signed in', () => {
      renderAt('/projects', undefined, { visitorLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }] });

      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    });
  });

  describe('appearance', () => {
    const renderThemed = (extraProps: Partial<React.ComponentProps<typeof AppLayout>> = {}) =>
      render(
        <VisinThemeProvider>
          <MemoryRouter initialEntries={['/projects']}>
            <AppLayout appName="Visin App" navGroups={navGroups} user={null} onLogout={onLogout} {...extraProps}>
              <div />
            </AppLayout>
          </MemoryRouter>
        </VisinThemeProvider>
      );
    const appearance = () => screen.getByRole('button', { name: /^Appearance/ });

    it('steps through Auto, Light and Dark from the top bar, and says what comes next', async () => {
      renderThemed();
      expect(appearance()).toHaveAccessibleName('Appearance: Auto. Switch to Light');

      fireEvent.click(appearance());
      expect(appearance()).toHaveAccessibleName('Appearance: Light. Switch to Dark');
      fireEvent.click(appearance());

      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
      expect(appearance()).toHaveAccessibleName('Appearance: Dark. Switch to Auto');
      fireEvent.click(appearance());
      expect(appearance()).toHaveAccessibleName('Appearance: Auto. Switch to Light');
    });

    it('is there for a visitor, who has no account menu, and while the session is still being checked', () => {
      renderThemed({ isAuthenticated: false });
      expect(appearance()).toBeInTheDocument();
      cleanup();

      renderThemed({ authPending: true });
      expect(appearance()).toBeInTheDocument();
    });

    it('is there for a signed-in member too', () => {
      renderThemed({ user: { name: 'Test User' } });

      expect(appearance()).toBeInTheDocument();
    });
  });

  describe('new menu', () => {
    const createItems: AppLayoutNavItem[] = [
      { text: 'Project', icon: <i />, path: '/projects?new=1' },
      { text: 'API key', icon: <i />, href: 'https://account.test/account/api-keys' }
    ];

    it('lists what a member can create, routing client-side where it can', () => {
      renderAt('/datasets', undefined, { createItems });

      fireEvent.click(screen.getByRole('button', { name: 'New' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Project' }));

      expect(screen.getByTestId('path')).toHaveTextContent('/projects');
    });

    it('links another app as a plain anchor', () => {
      renderAt('/datasets', undefined, { createItems });

      fireEvent.click(screen.getByRole('button', { name: 'New' }));

      expect(screen.getByRole('menuitem', { name: 'API key' })).toHaveAttribute(
        'href',
        'https://account.test/account/api-keys'
      );
    });

    it('is absent without anything to create', () => {
      renderAt('/datasets');

      expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    it('is absent unless the app handles it', () => {
      renderAt('/projects');

      expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();
    });

    it('hands what was typed to the app, trimmed', async () => {
      const onSearch = vi.fn();
      renderAt('/projects', undefined, { onSearch });

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: '  window  ' } });
      fireEvent.submit(screen.getByRole('search'));

      expect(onSearch).toHaveBeenCalledWith('window');
      await waitFor(() => expect(screen.queryByRole('search')).not.toBeInTheDocument());
    });

    it('ignores an empty query', () => {
      const onSearch = vi.fn();
      renderAt('/projects', undefined, { onSearch });

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      fireEvent.submit(screen.getByRole('search'));

      expect(onSearch).not.toHaveBeenCalled();
    });

    it('opens from the keyboard anywhere on the page', () => {
      renderAt('/projects', undefined, { onSearch: vi.fn() });

      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

      expect(screen.getByRole('search')).toBeInTheDocument();
    });

    it('closes on Escape without searching', async () => {
      const onSearch = vi.fn();
      renderAt('/projects', undefined, { onSearch });

      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('search')).not.toBeInTheDocument());
      expect(onSearch).not.toHaveBeenCalled();
    });

    describe('on a wide screen', () => {
      beforeEach(() => {
        // Wide, but not compact: only the min-width queries match.
        Object.defineProperty(window, 'matchMedia', {
          configurable: true,
          writable: true,
          value: (query: string) => ({
            matches: query.includes('min-width'),
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

      it('shows the box itself, with its placeholder and shortcut, which opens the same search', () => {
        renderAt('/projects', undefined, { onSearch: vi.fn(), searchPlaceholder: 'Search projects…' });

        const box = screen.getByRole('button', { name: 'Search' });
        expect(box).toHaveTextContent('Search projects…');
        expect(box).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
        fireEvent.click(box);

        expect(screen.getByRole('search')).toBeInTheDocument();
      });
    });

    it('leaves a plain k alone', () => {
      renderAt('/projects', undefined, { onSearch: vi.fn() });

      fireEvent.keyDown(window, { key: 'k' });

      expect(screen.queryByRole('search')).not.toBeInTheDocument();
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
      // Account is in the app bar, not among the places.
      expect(within(tabBar).queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Account' })).toBeInTheDocument();
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

    it('names the page in the app bar instead of a page title', () => {
      const { unmount } = renderAt('/jobs');
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      unmount();

      // A group of one has no dropdown: the app bar names its section.
      const { container } = renderAt('/datasets');
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      expect(container.querySelector('header')).toHaveTextContent('Datasets');
    });

    it('turns New into an icon that opens the same menu', () => {
      renderAt('/datasets', undefined, {
        createItems: [{ text: 'Project', icon: <i />, path: '/projects?create=1' }]
      });

      fireEvent.click(screen.getByRole('button', { name: 'New' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Project' }));

      expect(screen.getByTestId('path')).toHaveTextContent('/projects');
    });

    it('keeps Sign in and Sign up in the app bar, and leaves the docs links to the desktop', () => {
      renderAt('/projects', null, {
        isAuthenticated: false,
        onSignup: vi.fn(),
        visitorLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }]
      });

      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
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
