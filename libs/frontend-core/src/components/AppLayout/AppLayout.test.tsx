import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout, type AppLayoutNavItem, type AppLayoutUser } from './AppLayout';

const navItems: AppLayoutNavItem[] = [
  { text: 'Jobs', icon: <span>jobs-icon</span>, path: '/jobs' },
  { text: 'New job', icon: <span>new-job-icon</span>, path: '/jobs/new' }
];

const onLogout = vi.fn();

const renderAt = (
  path: string,
  user: AppLayoutUser | null = { name: 'Test User', email: 'test@example.com' },
  extraProps: Partial<React.ComponentProps<typeof AppLayout>> = {}
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout
        appName="Jobs App"
        subtitle="Manage jobs."
        navItems={navItems}
        user={user}
        onLogout={onLogout}
        {...extraProps}
      >
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>
  );

// Both drawers render a user block, so every query here takes the first match.
const openUserMenu = () => fireEvent.click(screen.getAllByLabelText('open user menu')[0]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppLayout', () => {
  it('renders the brand, nav items, and children', () => {
    renderAt('/jobs');

    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('New job').length).toBeGreaterThan(0);
  });

  it('shows the active nav item as the desktop header title', () => {
    renderAt('/jobs');

    expect(screen.getByRole('heading', { level: 4, name: 'Jobs' })).toBeInTheDocument();
  });

  it('does not mark a parent path active when a sibling path exactly matches the current route', () => {
    renderAt('/jobs/new');

    expect(screen.getByRole('heading', { level: 4, name: 'New job' })).toBeInTheDocument();
  });

  it('falls back to appName as the title outside known routes', () => {
    renderAt('/somewhere-else');

    expect(screen.getByRole('heading', { level: 4, name: 'Jobs App' })).toBeInTheDocument();
  });

  it('shows the signed-in user name and email', () => {
    renderAt('/jobs');

    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
  });

  it('falls back to "User" when the user has no name', () => {
    renderAt('/jobs', { email: 'test@example.com' });

    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('handles a null user', () => {
    renderAt('/jobs', null);

    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('logs out from the user menu', () => {
    renderAt('/jobs');

    openUserMenu();
    fireEvent.click(screen.getByText('Logout'));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('keeps the user block out of the page header', () => {
    const { container } = renderAt('/jobs');

    // Account actions belong in the drawer; a header block cost every page a
    // band of vertical space.
    const main = container.querySelector('main')!;
    expect(within(main).queryByText('Test User')).not.toBeInTheDocument();
    expect(within(main).queryByLabelText('open user menu')).not.toBeInTheDocument();
  });

  it('toggles the mobile drawer', () => {
    renderAt('/jobs');

    fireEvent.click(screen.getByLabelText('open drawer'));

    // Temporary drawer content mounts (keepMounted) — brand appears more than once.
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(1);
  });

  it('closes the mobile drawer when a nav item is clicked', () => {
    renderAt('/jobs');

    fireEvent.click(screen.getByLabelText('open drawer'));
    const jobsLinks = screen.getAllByText('Jobs');
    fireEvent.click(jobsLinks[jobsLinks.length - 1]);

    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
  });

  describe('grouped nav items', () => {
    const groupedNav: AppLayoutNavItem[] = [
      { text: 'Projects', icon: <span>p</span>, path: '/projects', group: 'Vision' },
      { text: 'Datasets', icon: <span>d</span>, path: '/datasets', group: 'Vision' },
      { text: 'Jobs', icon: <span>j</span>, href: 'https://label.test/jobs', group: 'Labeling' }
    ];

    const renderGrouped = (extraProps: Partial<React.ComponentProps<typeof AppLayout>> = {}) =>
      render(
        <MemoryRouter initialEntries={['/projects']}>
          <AppLayout appName="Vision" subtitle="s" navItems={groupedNav} user={null} onLogout={onLogout} {...extraProps}>
            <div>page content</div>
          </AppLayout>
        </MemoryRouter>
      );

    it('draws one heading per group, above its first item', () => {
      const { container } = renderGrouped();
      const nav = within(container.querySelector('nav')!);

      expect(nav.getAllByText('Vision')).toHaveLength(1);
      expect(nav.getAllByText('Labeling')).toHaveLength(1);
      // The heading precedes the group's first item in document order.
      const heading = nav.getByText('Labeling');
      const jobs = nav.getByText('Jobs');
      expect(heading.compareDocumentPosition(jobs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('draws no headings for ungrouped items', () => {
      const { container } = renderAt('/jobs');

      expect(container.querySelector('nav')!.querySelectorAll('.MuiDivider-root')).toHaveLength(1);
      expect(within(container.querySelector('nav')!).queryByText('Jobs App')).not.toBeInTheDocument();
    });

    it('swaps headings for a rule between groups on the collapsed rail', () => {
      const { container } = renderGrouped({ collapsible: true });
      const nav = () => container.querySelector('nav')!;
      const dividers = () => nav().querySelectorAll('.MuiDivider-root').length;
      const before = dividers();

      fireEvent.click(screen.getByLabelText('collapse navigation'));

      expect(within(nav()).queryByText('Labeling')).not.toBeInTheDocument();
      // One rule between the two groups, none above the first.
      expect(dividers()).toBe(before + 1);
    });
  });

  it('applies a custom max content width', () => {
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <AppLayout
          appName="Jobs App"
          subtitle="Manage jobs."
          navItems={navItems}
          user={null}
          onLogout={onLogout}
          maxContentWidth={1400}
        >
          <div>page content</div>
        </AppLayout>
      </MemoryRouter>
    );

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  describe('external nav items', () => {
    const mixedNav: AppLayoutNavItem[] = [
      { text: 'Datasets', icon: <span>d</span>, path: '/datasets' },
      { text: 'Jobs', icon: <span>j</span>, href: 'https://label.test/jobs' }
    ];

    it('renders a sibling app section as a plain anchor', () => {
      render(
        <MemoryRouter initialEntries={['/datasets']}>
          <AppLayout appName="Vision" subtitle="s" navItems={mixedNav} user={null} onLogout={onLogout}>
            <div>page content</div>
          </AppLayout>
        </MemoryRouter>
      );

      // A full page load, not a client-side route change.
      expect(screen.getAllByText('Jobs')[0].closest('a')).toHaveAttribute(
        'href',
        'https://label.test/jobs'
      );
    });

    it('never marks an external item active', () => {
      render(
        <MemoryRouter initialEntries={['/jobs']}>
          <AppLayout appName="Vision" subtitle="s" navItems={mixedNav} user={null} onLogout={onLogout}>
            <div>page content</div>
          </AppLayout>
        </MemoryRouter>
      );

      const jobsButton = screen.getAllByText('Jobs')[0].closest('.MuiListItemButton-root');
      expect(jobsButton?.className).not.toContain('Mui-selected');
    });
  });

  describe('anonymous visitors', () => {
    it('shows a Login button in place of the user block', () => {
      const onLogin = vi.fn();
      renderAt('/jobs', null, { isAuthenticated: false, onLogin });

      fireEvent.click(screen.getAllByText('Login')[0]);

      expect(onLogin).toHaveBeenCalled();
      expect(screen.queryByText('Logout')).not.toBeInTheDocument();
    });
  });

  describe('account link', () => {
    it('is absent unless an accountUrl is given', () => {
      renderAt('/jobs');
      openUserMenu();

      expect(screen.queryByText('Account')).not.toBeInTheDocument();
    });

    it('navigates to account-front when chosen', () => {
      const assign = vi.fn();
      Object.defineProperty(window, 'location', { value: { href: '' }, writable: true });

      renderAt('/jobs', { name: 'Test User' }, { accountUrl: 'https://account.test' });
      openUserMenu();
      fireEvent.click(screen.getByText('Account'));

      expect(window.location.href).toBe('https://account.test');
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('collapsible drawer', () => {
    it('has no collapse control by default', () => {
      renderAt('/jobs');

      expect(screen.queryByLabelText('collapse navigation')).not.toBeInTheDocument();
    });

    it('collapses and expands, hiding the labels while collapsed', () => {
      const { container } = renderAt('/jobs', null, { collapsible: true });
      const nav = () => within(container.querySelector('nav')!);

      // The mobile drawer is a Modal and portals out of <nav>, so only the
      // permanent desktop drawer is counted here.
      expect(nav().queryAllByText('Jobs').length).toBe(1);

      fireEvent.click(screen.getByLabelText('collapse navigation'));
      expect(nav().queryAllByText('Jobs').length).toBe(0);

      fireEvent.click(screen.getByLabelText('expand navigation'));
      expect(nav().queryAllByText('Jobs').length).toBe(1);
    });
  });

  describe('page header', () => {
    it('can be hidden for apps whose pages carry their own titles', () => {
      renderAt('/jobs', { name: 'Test User', email: 'test@example.com' }, { showPageHeader: false });

      expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
      // The user block stays in the drawer: it is the only route to Account
      // and Logout.
      expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    });
  });
});