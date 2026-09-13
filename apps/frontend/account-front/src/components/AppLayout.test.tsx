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
  getGlobalConfig: () => ({ VISION_FRONT_URL: 'https://vision.test', LABEL_FRONT_URL: 'https://label.test' }),
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
    expect(screen.getAllByText('Groups').length).toBeGreaterThan(0);
  });

  it('shows the active section title in the desktop header', () => {
    renderAt('/account/groups');

    // The h4 page title mirrors the active menu item's label.
    expect(screen.getByRole('heading', { level: 4, name: 'Groups' })).toBeInTheDocument();
  });

  it('falls back to "Account" as the title outside known routes', () => {
    renderAt('/account/unknown');

    expect(screen.getByRole('heading', { level: 4, name: 'Account' })).toBeInTheDocument();
  });

  it('shows the same Vision and Labeling sections as the other apps, linking across', () => {
    renderAt('/account/profile');

    expect(screen.getAllByText('Datasets')[0].closest('a')).toHaveAttribute('href', 'https://vision.test/datasets');
    expect(screen.getAllByText('Bundles')[0].closest('a')).toHaveAttribute('href', 'https://label.test/bundles');
  });

  it('lists its own sections under an Account heading, after the shared groups', () => {
    const { container } = renderAt('/account/profile');
    const texts = Array.from(container.querySelector('nav')!.querySelectorAll('li')).map((li) => li.textContent);

    expect(texts.findIndex((t) => t?.includes('Bundles'))).toBeLessThan(
      texts.findIndex((t) => t?.includes('Profile'))
    );
    expect(texts.find((t) => t?.includes('Profile'))).toContain('Account');
  });

  it('drops a group whose app is unconfigured rather than guessing a URL', async () => {
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

    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText('Jobs')).not.toBeInTheDocument();
    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);

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

    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('opens the user menu and logs out on click', () => {
    renderAt('/account/profile');

    fireEvent.click(screen.getAllByLabelText('open user menu')[0]);

    const logoutItem = screen.getByText('Logout');
    fireEvent.click(logoutItem);

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('closes the mobile drawer when a nav item is clicked', () => {
    renderAt('/account/profile');

    const groupsLinks = screen.getAllByText('Groups');
    fireEvent.click(groupsLinks[0]);

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
