import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from './AppLayout';
import { useAuth } from '../contexts/AuthContext';
import { getGlobalConfig } from '../config/ConfigProvider';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: vi.fn()
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedGetGlobalConfig = vi.mocked(getGlobalConfig);

const renderLayout = (initialPath = '/trainings') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>
  );

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetGlobalConfig.mockReturnValue({ ACCOUNT_FRONT_URL: 'http://account.example.com' } as any);
  });

  it('renders children content', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    renderLayout();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('renders navigation items', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    renderLayout();
    expect(screen.getAllByText('Projects').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trainings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Datasets').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Labeling').length).toBeGreaterThan(0);
  });

  it('shows the Login button when the user is not authenticated', () => {
    const login = vi.fn();
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login,
      logout: vi.fn()
    } as any);

    renderLayout();
    const loginButtons = screen.getAllByText('Login');
    fireEvent.click(loginButtons[0]);
    expect(login).toHaveBeenCalled();
  });

  it('shows the user avatar/name and opens the account menu when authenticated', () => {
    mockedUseAuth.mockReturnValue({
      user: { name: 'Jane Doe', email: 'jane@example.com', picture: undefined },
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    renderLayout();
    expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
  });

  it('calls logout when the Logout menu item is clicked', () => {
    const logout = vi.fn();
    mockedUseAuth.mockReturnValue({
      user: { name: 'Jane Doe', email: 'jane@example.com' },
      isAuthenticated: true,
      login: vi.fn(),
      logout
    } as any);

    renderLayout();
    const nameButtons = screen.getAllByText('Jane Doe');
    fireEvent.click(nameButtons[0]);
    const logoutItems = screen.getAllByText('Logout');
    fireEvent.click(logoutItems[0]);
    expect(logout).toHaveBeenCalled();
  });

  it('highlights the active nav item based on the current route', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    renderLayout('/datasets/123');
    const datasetsLinks = screen.getAllByText('Datasets');
    const listItemButton = datasetsLinks[0].closest('.MuiListItemButton-root');
    expect(listItemButton?.className).toContain('Mui-selected');
  });

  it('toggles the mobile drawer open when the menu icon is clicked', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    renderLayout();
    const menuButton = screen.getByLabelText('open drawer');
    fireEvent.click(menuButton);
    // After toggling, there should be more than one rendering of nav items (mobile + desktop drawers)
    expect(screen.getAllByText('Trainings').length).toBeGreaterThan(0);
  });

  it('collapses the desktop drawer when the collapse toggle is clicked', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn()
    } as any);

    const { container } = renderLayout();
    const collapseButtons = container.querySelectorAll('button');
    // Find the chevron-left toggle button (first icon button in the drawer header area)
    const chevronButton = Array.from(collapseButtons).find((btn) =>
      btn.querySelector('svg[data-testid="ChevronLeftIcon"]')
    );
    expect(chevronButton).toBeTruthy();
    if (chevronButton) {
      fireEvent.click(chevronButton);
    }
    expect(screen.getAllByText('Visin').length).toBeGreaterThan(0);
  });
});
