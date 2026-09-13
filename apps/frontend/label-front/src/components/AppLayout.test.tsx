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
    renderAt('/jobs');

    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
    expect(screen.getByText('page content')).toBeInTheDocument();
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
  });

  it('shows the same menu as vision-front, with the Vision sections linking across', () => {
    renderAt('/jobs');

    // Identical contents in both apps: crossing over changes the highlight, not the menu.
    expect(screen.getAllByText('Datasets')[0].closest('a')).toHaveAttribute('href', 'https://vision.test/datasets');
    expect(screen.getAllByText('Bundles')[0].closest('a')).toHaveAttribute('href', '/bundles');
    expect(screen.getAllByText('Jobs')[0].closest('.MuiListItemButton-root')?.className).toContain('Mui-selected');
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

    expect(screen.getAllByText('Test User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('test@example.com').length).toBeGreaterThan(0);
  });

  it('falls back to "User" when the user has no name', () => {
    mockUser = { email: 'test@example.com' };
    renderAt('/jobs');

    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('logs out from the user menu', () => {
    renderAt('/jobs');

    const avatarButtons = screen.getAllByRole('button');
    fireEvent.click(avatarButtons[avatarButtons.length - 1]);
    fireEvent.click(screen.getByText('Logout'));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  // The workbench is a viewer, not a document: the shell's title band and its
  // reading-width cap both come out of the frame's space, which on that page is
  // the whole point of the page.
  it('drops the page header on the workbench and keeps it everywhere else', () => {
    const { unmount } = renderAt('/jobs/j1/work');
    expect(screen.queryByRole('heading', { level: 4 })).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
    unmount();

    renderAt('/jobs/j1');
    expect(screen.getByRole('heading', { level: 4 })).toBeInTheDocument();
  });

  it('toggles the mobile drawer', () => {
    renderAt('/jobs');

    fireEvent.click(screen.getByLabelText('open drawer'));

    // Temporary drawer content mounts (keepMounted) — brand appears more than once.
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(1);
  });
});
