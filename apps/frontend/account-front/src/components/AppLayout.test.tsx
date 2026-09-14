import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const accountBar = () => within(screen.getByRole('navigation', { name: 'Account' }));
const openAccount = () => fireEvent.click(main().getByRole('button', { name: 'Account' }));

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { name: 'Test User', email: 'test@example.com' };
});

describe('AppLayout', () => {
  it('lists its own sections in the section bar, as local routes', () => {
    renderAt('/account/profile');

    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(accountBar().getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(accountBar().getByRole('link', { name: 'Groups' })).toHaveAttribute('href', '/account/groups');
    expect(main().getByRole('button', { name: 'Account' })).toHaveAttribute('aria-current', 'true');
  });

  it('shows the active section title in the desktop header', () => {
    renderAt('/account/groups');

    // The h4 page title mirrors the active section's label.
    expect(screen.getByRole('heading', { level: 4, name: 'Groups' })).toBeInTheDocument();
  });

  it('falls back to "Account" as the title outside known routes', () => {
    renderAt('/account/unknown');

    expect(screen.getByRole('heading', { level: 4, name: 'Account' })).toBeInTheDocument();
  });

  it('shows the same groups as the other apps, linking across', () => {
    renderAt('/account/profile');

    expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('href', 'https://vision.test/projects');
    expect(main().getByRole('link', { name: 'Data' })).toHaveAttribute('href', 'https://vision.test/datasets');
    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('href', 'https://label.test/jobs');
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

    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Labels' })).not.toBeInTheDocument();
    expect(accountBar().getByRole('link', { name: 'Profile' })).toBeInTheDocument();

    vi.doUnmock('../config/ConfigProvider');
  });

  it('shows the user name and email in the account menu', () => {
    renderAt('/account/profile');
    openAccount();

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('falls back to "User" when there is no name', () => {
    mockUser = { email: 'anon@example.com' };
    renderAt('/account/profile');
    openAccount();

    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('opens the account menu and logs out on click', () => {
    renderAt('/account/profile');

    openAccount();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
