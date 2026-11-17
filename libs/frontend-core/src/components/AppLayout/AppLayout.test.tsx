import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppLayout, type AppLayoutNavGroup, type AppLayoutNavItem, type AppLayoutUser } from './AppLayout';
import { useBarBack } from './barBack';
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
const onSignup = vi.fn();

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
    it('shows section tabs without repeating the area name', () => {
      const { container } = renderAt('/jobs');

      const header = container.querySelector('header')!;
      expect(header).not.toHaveTextContent('Labels');
      expect(within(header).getByRole('link', { name: 'Jobs' })).toHaveAttribute('aria-current', 'page');
    });

    it('leaves out a redundant app title outside any area', () => {
      const { container } = renderAt('/somewhere-else');

      expect(container.querySelector('header')).not.toHaveTextContent('Visin App');
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

    it('signs out from the menu', () => {
      renderAt('/projects');

      openAccount();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));

      expect(onLogout).toHaveBeenCalledTimes(1);
    });

    it('offers only Sign out where Account is unreachable', () => {
      renderAt('/projects', undefined, { accountItems: [] });

      openAccount();

      expect(screen.queryByRole('menuitem', { name: 'Profile' })).not.toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
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

    it('lists what the app says under the name, not every Account section', () => {
      renderAt('/projects', undefined, {
        menuItems: [{ text: 'Account settings', icon: null, path: '/account/profile' }]
      });

      openAccount();
      const items = within(screen.getByRole('menu', { name: 'Account' })).getAllByRole('menuitem');

      expect(items.map((item) => item.textContent)).toEqual(['TTest Usertest@example.com', 'Account settings', 'Sign out']);
    });

    it('opens Account from the name, where Account is reachable', () => {
      renderAt('/projects');

      openAccount();

      expect(screen.getByRole('menuitem', { name: /Test User/ })).toHaveAttribute('href', '/account/profile');
    });

    it('does not make the name a link where Account is unreachable', () => {
      renderAt('/projects', undefined, { accountItems: [] });

      openAccount();

      expect(screen.getByRole('menuitem', { name: /Test User/ })).not.toHaveAttribute('href');
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

    it('ends in Sign out without a stray divider where Account has no sections', () => {
      renderAt('/projects', undefined, { accountItems: [] });

      openAccount();

      expect(screen.getAllByRole('separator')).toHaveLength(1);
      expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
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
      expect(screen.queryByText('Sign out')).not.toBeInTheDocument();
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
        siteLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }],
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

    it('gets no Sign in while signed in, but still the links in the bar', () => {
      renderAt('/projects', undefined, { siteLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }] });

      expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://docs.test/docs');
    });

    it('shows a link that has an icon as the icon, named for the screen reader and the tooltip', () => {
      renderAt('/projects', undefined, {
        siteLinks: [{ text: 'GitHub', href: 'https://github.test/visin', icon: <i data-testid="gh" />, newTab: true }]
      });

      const link = screen.getByRole('link', { name: 'GitHub' });
      expect(link).toHaveAttribute('title', 'GitHub');
      expect(link).toContainElement(screen.getByTestId('gh'));
      expect(link).not.toHaveTextContent('GitHub');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });

    it('keeps the links out of the account menu, which has the sections and Sign out only', () => {
      renderAt('/projects', undefined, { siteLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }] });

      openAccount();
      const items = within(screen.getByRole('menu', { name: 'Account' })).getAllByRole('menuitem');

      expect(items.map((item) => item.textContent)).toEqual(['TTest Usertest@example.com', 'Profile', 'Groups', 'Sign out']);
    });

    it('shows the same links to a visitor', () => {
      visitor({ siteLinks: [{ text: 'GitHub', href: 'https://github.test/visin', icon: <i />, newTab: true }] });

      expect(screen.getByRole('link', { name: 'GitHub' })).toHaveAttribute('target', '_blank');
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
    const appearance = () => screen.getByRole('button', { name: /^Switch to (light|dark) mode$/ });

    // The choice is kept per device, so one test's would be the next one's starting point.
    beforeEach(() => {
      localStorage.clear();
    });

    it('flips between light and dark, and says which a click gives', async () => {
      renderThemed();
      expect(appearance()).toHaveAccessibleName('Switch to dark mode');

      fireEvent.click(appearance());

      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
      expect(appearance()).toHaveAccessibleName('Switch to light mode');
      fireEvent.click(appearance());
      await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
      expect(appearance()).toHaveAccessibleName('Switch to dark mode');
    });

    it('offers no Auto: it is a plain switch, with the device’s choice left to the settings', () => {
      renderThemed();

      expect(screen.queryByRole('button', { name: /auto/i })).not.toBeInTheDocument();
      expect(appearance()).toHaveAttribute('title', 'Switch to dark mode');
    });

    it('flips what is showing when the device decides, so the first click always changes the page', async () => {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: query.includes('prefers-color-scheme: dark'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        })
      });
      try {
        renderThemed();
        // The device is dark and nothing was chosen: dark is showing, so the click goes to light.
        await waitFor(() => expect(appearance()).toHaveAccessibleName('Switch to light mode'));

        fireEvent.click(appearance());

        await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
        expect(appearance()).toHaveAccessibleName('Switch to dark mode');
      } finally {
        delete (window as { matchMedia?: unknown }).matchMedia;
      }
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

    describe('recently visited', () => {
      const recent = [
        { key: 'project:p1', text: 'Window ablations', secondary: 'Project', icon: <i data-testid="icon" />, path: '/projects/window-ablations' },
        { key: 'dataset:d1', text: 'Harbour frames', path: '/datasets/d1' }
      ];

      it('offers where the person was lately before anything is typed', () => {
        renderAt('/projects', undefined, { onSearch: vi.fn(), recent });

        fireEvent.click(screen.getByRole('button', { name: 'Search' }));

        const list = screen.getByRole('list', { name: 'Recently visited' });
        expect(within(list).getAllByRole('link').map((link) => link.textContent)).toEqual(['Window ablationsProject', 'Harbour frames']);
        expect(within(list).getByRole('link', { name: /Window ablations/ })).toHaveAttribute('href', '/projects/window-ablations');
        expect(screen.getAllByTestId('icon')).toHaveLength(1);
      });

      it('goes there client-side and closes the search', async () => {
        renderAt('/projects', undefined, { onSearch: vi.fn(), recent });

        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        fireEvent.click(screen.getByRole('link', { name: /Harbour frames/ }));

        expect(screen.getByTestId('path')).toHaveTextContent('/datasets/d1');
        await waitFor(() => expect(screen.queryByRole('search')).not.toBeInTheDocument());
      });

      it('gives way to what is being typed', () => {
        renderAt('/projects', undefined, { onSearch: vi.fn(), recent });

        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'win' } });

        expect(screen.queryByRole('list', { name: 'Recently visited' })).not.toBeInTheDocument();
      });

      it('shows nothing where there is nowhere to offer', () => {
        renderAt('/projects', undefined, { onSearch: vi.fn() });

        fireEvent.click(screen.getByRole('button', { name: 'Search' }));

        expect(screen.queryByText('Recently visited')).not.toBeInTheDocument();
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

  describe('app extensions', () => {
    it("puts the app's own controls in the top bar", () => {
      const { container } = renderAt('/projects', undefined, { headerActions: <button>Chat</button> });
      expect(bar(container).getByRole('button', { name: 'Chat' })).toBeInTheDocument();
    });

    it('docks a side panel beside the bar and the page, not inside the page', () => {
      const { container } = renderAt('/projects', undefined, {
        sidePanel: <aside aria-label="Side conversation">Panel</aside>
      });
      const panel = screen.getByRole('complementary', { name: 'Side conversation' });
      const content = container.querySelector('main')!;
      expect(content.contains(panel)).toBe(false);
      expect(container.querySelector('header')!.contains(panel)).toBe(false);
      expect(content.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
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

    it("leaves out the side panel, which has no room beside a phone's page", () => {
      renderAt('/projects', undefined, { sidePanel: <aside aria-label="Side conversation">Panel</aside> });
      expect(screen.queryByRole('complementary', { name: 'Side conversation' })).not.toBeInTheDocument();
    });

    it('moves the groups to a tab bar under the content, with More last', () => {
      const { container } = renderAt('/projects');

      const tabBar = screen.getByRole('navigation', { name: 'Main' });
      expect(within(tabBar).getAllByRole('link').map(link => link.textContent)).toEqual([
        'Projects',
        'Data',
        'Labels'
      ]);
      // Account is behind More, not in the app bar or among the places.
      expect(within(tabBar).getAllByRole('button').map(button => button.textContent)).toEqual(['More']);
      expect(screen.queryByRole('button', { name: 'Account' })).not.toBeInTheDocument();
      const content = container.querySelector('main')!;
      expect(content.compareDocumentPosition(tabBar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The rail's logo has no room there.
      expect(screen.queryByAltText('Visin')).not.toBeInTheDocument();
    });

    it('keeps the app bar for the page: search and, for a member, nothing else', () => {
      const { container } = renderAt('/projects', undefined, {
        onSearch: vi.fn(),
        createItems: [{ text: 'Project', icon: <i />, path: '/projects?create=1' }],
        siteLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }]
      });

      expect(bar(container).getAllByRole('button').map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
        'All projects',
        'Search'
      ]);
      expect(screen.queryByRole('button', { name: 'New' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /switch to/i })).not.toBeInTheDocument();
    });

    it('turns the section bar into a dropdown named for the current section', () => {
      renderAt('/trainings');

      fireEvent.click(sectionBar('Projects').getByRole('button', { name: 'Trainings' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'All projects' }));

      expect(screen.getByTestId('path')).toHaveTextContent('/projects');
    });

    it('names the way back, not a dropdown, on a page inside a section', () => {
      const { container } = renderAt('/trainings/t1');

      expect(bar(container).queryByRole('button', { name: 'Trainings' })).not.toBeInTheDocument();
      const back = bar(container).getByRole('link', { name: 'Back to Trainings' });
      expect(back).toHaveAttribute('href', '/trainings');
      fireEvent.click(back);
      expect(screen.getByTestId('path')).toHaveTextContent('/trainings');
    });

    it('tells the page where its own way back would lead, so it can leave it out, and stops when the bar has none', () => {
      const Probe = () => <div data-testid="bar-back">{useBarBack()?.path ?? 'none'}</div>;
      const view = renderAt('/trainings/t1', undefined, { headerActions: <Probe /> });

      expect(screen.getByTestId('bar-back')).toHaveTextContent('/trainings');
      expect(window.__visinBarBack).toEqual({ path: '/trainings', label: 'Trainings' });

      view.unmount();
      expect(window.__visinBarBack).toBeUndefined();

      renderAt('/trainings', undefined, { headerActions: <Probe /> });
      expect(screen.getByTestId('bar-back')).toHaveTextContent('none');
    });

    it('shows no way back on the root page of an app, which is a section itself', () => {
      const { container } = renderAt('/', undefined, {
        navGroups: [{ label: 'Home', icon: <i />, items: [{ text: 'For you', icon: <i />, path: '/' }, { text: 'Explore', icon: <i />, path: '/explore' }] }]
      });

      expect(bar(container).queryByRole('link', { name: /^Back to/ })).not.toBeInTheDocument();
      expect(bar(container).getByRole('button', { name: 'For you' })).toBeInTheDocument();
    });

    it("calls the group's first section by the group's name", () => {
      const { container } = renderAt('/projects/p1');

      expect(bar(container).getByRole('link', { name: 'Back to Projects' })).toHaveAttribute('href', '/projects');
    });

    it('goes back to the first section from a page that belongs to the group but to none of its sections', () => {
      const { container } = renderAt('/benchmarks');

      expect(bar(container).getByRole('link', { name: 'Back to Projects' })).toHaveAttribute('href', '/projects');
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

    it('keeps Sign in and Sign up in the app bar, and leaves the docs links to the desktop', () => {
      renderAt('/projects', null, {
        isAuthenticated: false,
        onSignup: vi.fn(),
        siteLinks: [{ text: 'Docs', href: 'https://docs.test/docs' }]
      });

      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sign up' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Docs' })).not.toBeInTheDocument();
    });

    describe('with more groups than tabs', () => {
      const group = (label: string, path: string): AppLayoutNavGroup => ({
        label,
        icon: <i />,
        items: [{ text: label, icon: <i />, path }]
      });
      const many = [
        group('Home', '/'),
        group('Projects', '/projects'),
        group('Data', '/datasets'),
        group('Models', '/models'),
        group('Papers', '/papers'),
        group('Labels', '/jobs')
      ];
      const tabs = () =>
        [...screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a, button')].map(tab => tab.textContent);

      it('keeps four tabs and More, and moves the rest into the sheet', () => {
        renderAt('/projects', undefined, { navGroups: many });

        expect(tabs()).toEqual(['Home', 'Projects', 'Data', 'Models', 'More']);

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const sheet = within(screen.getByRole('menu', { name: 'More' }));
        expect(sheet.getByRole('menuitem', { name: 'Papers' })).toHaveAttribute('href', '/papers');
        expect(sheet.getByRole('menuitem', { name: 'Labels' })).toHaveAttribute('href', '/jobs');
        expect(sheet.queryByRole('menuitem', { name: 'Data' })).not.toBeInTheDocument();
      });

      it('puts the centre tab in the middle of the groups, and makes room for it', () => {
        renderAt('/projects', undefined, {
          navGroups: many,
          centerTab: { label: 'Chat', icon: <i />, path: '/chat' }
        });

        expect(tabs()).toEqual(['Home', 'Projects', 'Chat', 'Data', 'More']);
        expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Chat' })).toHaveAttribute(
          'href',
          '/chat'
        );
      });

      it('lights the centre tab on its own pages only, and says how many are waiting', () => {
        const { unmount } = renderAt('/projects', undefined, {
          navGroups: many,
          centerTab: { label: 'Chat', icon: <i />, path: '/chat', badge: 3, ariaLabel: 'Chat, 3 unread' }
        });
        const chat = () => within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Chat, 3 unread' });
        expect(chat()).not.toHaveAttribute('aria-current');
        expect(chat()).toHaveTextContent('3');
        unmount();

        renderAt('/chat/some', undefined, {
          navGroups: many,
          centerTab: { label: 'Chat', icon: <i />, path: '/chat', badge: 3, ariaLabel: 'Chat, 3 unread' }
        });
        expect(chat()).toHaveAttribute('aria-current', 'true');
      });

      it("lets the app say whether its tab is lit", () => {
        renderAt('/chat', undefined, {
          navGroups: many,
          centerTab: { label: 'Chat', icon: <i />, path: '/chat', active: false }
        });

        expect(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Chat' })).not.toHaveAttribute(
          'aria-current'
        );
      });

      it('lights More while the page is in a group that is behind it', () => {
        renderAt('/papers', undefined, { navGroups: many });

        const more = screen.getByRole('button', { name: 'More' });
        expect(more).toHaveAttribute('aria-haspopup', 'dialog');
        expect(more).toHaveTextContent('More');
        // The Papers group is not a tab, so no tab is the current one: More is what is lit.
        expect(within(screen.getByRole('navigation', { name: 'Main' })).queryAllByRole('link', { current: true })).toHaveLength(0);
      });
    });

    describe('flush and immersive pages', () => {
      it('flush keeps both bars and drops only the page’s padding', () => {
        const { container } = renderAt('/projects', undefined, { flush: true });

        expect(container.querySelector('header')).not.toBeNull();
        expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
        expect(screen.getByText('page content')).toBeInTheDocument();
      });

      it('immersive takes both bars away and leaves the page', () => {
        const { container } = renderAt('/projects', undefined, { immersive: true });

        expect(container.querySelector('header')).toBeNull();
        expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
        expect(screen.getByText('page content')).toBeInTheDocument();
      });
    });

    describe('More', () => {
      it('is the account: who is signed in, where they go, and Sign out', () => {
        renderAt('/projects', { name: 'Test User', email: 'test@example.com' }, {
          menuItems: [{ text: 'Account settings', icon: <i />, path: '/account/profile' }]
        });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const sheet = within(screen.getByRole('menu', { name: 'More' }));
        expect(sheet.getByRole('menuitem', { name: /Test User/ })).toHaveAttribute('href', '/account/profile');
        expect(sheet.getByRole('menuitem', { name: 'Account settings' })).toBeInTheDocument();
        // Signing out is at the sheet's foot, outside the scrolling list.
        expect(sheet.queryByRole('menuitem', { name: 'Sign out' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(onLogout).toHaveBeenCalledTimes(1);
      });

      it('lists what a member can create, in the place of the bar’s New button', () => {
        renderAt('/datasets', undefined, {
          createItems: [{ text: 'Project', icon: <i />, path: '/projects?create=1' }]
        });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        fireEvent.click(within(screen.getByRole('menu', { name: 'More' })).getByRole('menuitem', { name: 'Project' }));

        expect(screen.getByTestId('path')).toHaveTextContent('/projects');
      });

      it('lists the links out of the app, which the bar has no room for', () => {
        renderAt('/projects', undefined, {
          siteLinks: [{ text: 'GitHub', href: 'https://github.test/visin', newTab: true }]
        });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));

        const link = within(screen.getByRole('menu', { name: 'More' })).getByRole('menuitem', { name: 'GitHub' });
        expect(link).toHaveAttribute('href', 'https://github.test/visin');
        expect(link).toHaveAttribute('target', '_blank');
      });

      it('sets the appearance, which a visitor has no account menu for either', async () => {
        localStorage.clear();
        render(
          <VisinThemeProvider>
            <MemoryRouter initialEntries={['/projects']}>
              <AppLayout appName="Visin App" navGroups={navGroups} user={null} isAuthenticated={false} onLogout={onLogout}>
                <div />
              </AppLayout>
            </MemoryRouter>
          </VisinThemeProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const appearance = within(screen.getByRole('group', { name: 'Appearance' }));
        fireEvent.click(appearance.getByRole('button', { name: 'Dark' }));

        await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
        expect(appearance.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(appearance.getByRole('button', { name: 'Light' }));
        await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
      });

      it('offers a visitor Sign in and Sign up, and no account', () => {
        renderAt('/projects', null, { isAuthenticated: false, onSignup });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const sheet = screen.getByRole('presentation');

        expect(within(sheet).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
        fireEvent.click(within(sheet).getByRole('button', { name: 'Sign up' }));
        expect(onSignup).toHaveBeenCalledTimes(1);
      });

      it('closes when the page changes some other way, as the back button does', async () => {
        const Away = () => {
          const navigate = useNavigate();
          return <button onClick={() => navigate('/datasets')}>away</button>;
        };
        renderAt('/projects', undefined, { headerActions: <Away /> });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        expect(screen.getByRole('menu', { name: 'More' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'away', hidden: true }));

        await waitFor(() => expect(screen.queryByRole('menu', { name: 'More' })).not.toBeInTheDocument());
      });

      it('offers neither Sign in nor Sign out while the session is still being checked', () => {
        renderAt('/projects', null, { isAuthenticated: false, onSignup, authPending: true });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        const sheet = within(screen.getByRole('presentation'));

        expect(sheet.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
        expect(sheet.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
        expect(sheet.getByRole('group', { name: 'Appearance' })).toBeInTheDocument();
      });

      it('closes when something in it is chosen', async () => {
        renderAt('/projects', undefined, {
          menuItems: [{ text: 'Account settings', icon: <i />, path: '/account/profile' }]
        });

        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Account settings' }));

        await waitFor(() => expect(screen.queryByRole('menu', { name: 'More' })).not.toBeInTheDocument());
        expect(screen.getByTestId('path')).toHaveTextContent('/account/profile');
      });
    });
  });
});
