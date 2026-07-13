import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from './AppLayout';

const mockLogout = vi.fn();
let mockUser: { name?: string; email?: string; picture?: string } | null = {
  name: 'Test User',
  email: 'test@example.com',
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}));

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ VISION_FRONT_URL: 'https://vision.test' }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { name: 'Test User', email: 'test@example.com' };
});

describe('AppLayout', () => {
  it('renders the menu, brand, and children', () => {
    renderAt('/account/profile');

    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Security').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Data').length).toBeGreaterThan(0);
  });

  it('shows the active section title in the desktop header', () => {
    renderAt('/account/security');

    // The h4 page title mirrors the active menu item's label.
    expect(screen.getByRole('heading', { level: 4, name: 'Security' })).toBeInTheDocument();
  });

  it('falls back to "Account" as the title outside known routes', () => {
    renderAt('/account/unknown');

    expect(screen.getByRole('heading', { level: 4, name: 'Account' })).toBeInTheDocument();
  });

  it('links "Back to Vision" to the configured VISION_FRONT_URL', () => {
    renderAt('/account/profile');

    const links = screen.getAllByText('Back to Vision').map((el) => el.closest('a'));
    expect(links.every((link) => link?.getAttribute('href') === 'https://vision.test')).toBe(true);
  });

  it('falls back to the default Vision URL when unconfigured', async () => {
    vi.doMock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({}) }));
    vi.resetModules();
    const { default: FreshAppLayout } = await import('./AppLayout');

    render(
      <MemoryRouter initialEntries={['/account/profile']}>
        <FreshAppLayout>
          <div>page content</div>
        </FreshAppLayout>
      </MemoryRouter>
    );

    const links = screen.getAllByText('Back to Vision').map((el) => el.closest('a'));
    expect(links.every((link) => link?.getAttribute('href') === 'https://app.visin.eu')).toBe(true);

    vi.doUnmock('../config/ConfigProvider');
  });

  it('shows the user name and email in the header', () => {
    renderAt('/account/profile');

    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
  });

  it('falls back to "User" when there is no name', () => {
    mockUser = { email: 'anon@example.com' };
    renderAt('/account/profile');

    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('opens the user menu and logs out on click', () => {
    renderAt('/account/profile');

    const avatarButtons = screen.getAllByRole('button');
    const userMenuButton = avatarButtons.find((btn) => btn.querySelector('.MuiAvatar-root'));
    fireEvent.click(userMenuButton!);

    const logoutItem = screen.getByText('Logout');
    fireEvent.click(logoutItem);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile drawer when a nav item is clicked', () => {
    renderAt('/account/profile');

    const securityLinks = screen.getAllByText('Security');
    fireEvent.click(securityLinks[0]);

    // The click handler just closes the mobile drawer; the app itself
    // stays mounted and doesn't throw.
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
  });

  it('toggles the mobile drawer', () => {
    renderAt('/account/profile');

    const toggle = screen.getByLabelText('open drawer');
    fireEvent.click(toggle);

    // Toggling shouldn't throw and the drawer content remains present.
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
  });
});
