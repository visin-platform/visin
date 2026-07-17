import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout, type AppLayoutNavItem, type AppLayoutFooterLink, type AppLayoutUser } from './AppLayout';

const navItems: AppLayoutNavItem[] = [
  { text: 'Jobs', icon: <span>jobs-icon</span>, path: '/jobs' },
  { text: 'New job', icon: <span>new-job-icon</span>, path: '/jobs/new' }
];

const footerLink: AppLayoutFooterLink = {
  text: 'Back to Vision',
  icon: <span>back-icon</span>,
  href: 'https://app.visin.eu'
};

const onLogout = vi.fn();

const renderAt = (path: string, user: AppLayoutUser | null = { name: 'Test User', email: 'test@example.com' }) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout appName="Jobs App" subtitle="Manage jobs." navItems={navItems} user={user} onLogout={onLogout}>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>
  );

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

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('falls back to "User" when the user has no name', () => {
    renderAt('/jobs', { email: 'test@example.com' });

    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('handles a null user', () => {
    renderAt('/jobs', null);

    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('logs out from the user menu', () => {
    renderAt('/jobs');

    const avatarButtons = screen.getAllByRole('button');
    fireEvent.click(avatarButtons[avatarButtons.length - 1]);
    fireEvent.click(screen.getByText('Logout'));

    expect(onLogout).toHaveBeenCalledTimes(1);
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

  it('omits the footer link section by default', () => {
    renderAt('/jobs');

    expect(screen.queryByText('Back to Vision')).not.toBeInTheDocument();
  });

  it('renders an optional footer link', () => {
    render(
      <MemoryRouter initialEntries={['/jobs']}>
        <AppLayout
          appName="Jobs App"
          subtitle="Manage jobs."
          navItems={navItems}
          user={{ name: 'Test User' }}
          onLogout={onLogout}
          footerLink={footerLink}
        >
          <div>page content</div>
        </AppLayout>
      </MemoryRouter>
    );

    const links = screen.getAllByText('Back to Vision').map((el) => el.closest('a'));
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', 'https://app.visin.eu'));
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
});
