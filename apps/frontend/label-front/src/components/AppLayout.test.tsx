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
    renderAt('/jobs');

    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
  });

  it('shows the active section title in the desktop header', () => {
    renderAt('/jobs');

    expect(screen.getByRole('heading', { level: 4, name: 'Jobs' })).toBeInTheDocument();
  });

  it('falls back to "Labeling" as the title outside known routes', () => {
    renderAt('/somewhere-else');

    expect(screen.getByRole('heading', { level: 4, name: 'Labeling' })).toBeInTheDocument();
  });

  it('shows the signed-in user name and email', () => {
    renderAt('/jobs');

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('falls back to "User" when the user has no name', () => {
    mockUser = { email: 'test@example.com' };
    renderAt('/jobs');

    expect(screen.getByText('User')).toBeInTheDocument();
  });

  it('logs out from the user menu', () => {
    renderAt('/jobs');

    const avatarButtons = screen.getAllByRole('button');
    fireEvent.click(avatarButtons[avatarButtons.length - 1]);
    fireEvent.click(screen.getByText('Logout'));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('toggles the mobile drawer', () => {
    renderAt('/jobs');

    fireEvent.click(screen.getByLabelText('open drawer'));

    // Temporary drawer content mounts (keepMounted) — brand appears more than once.
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(1);
  });
});
