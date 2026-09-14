import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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

const anonymous = () =>
  mockedUseAuth.mockReturnValue({ user: null, isAuthenticated: false, login: vi.fn(), logout: vi.fn() } as any);

const signedIn = (logout = vi.fn()) =>
  mockedUseAuth.mockReturnValue({
    user: { name: 'Jane Doe', email: 'jane@example.com' },
    isAuthenticated: true,
    login: vi.fn(),
    logout
  } as any);

const renderLayout = (initialPath = '/trainings') =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppLayout>
        <div>page content</div>
      </AppLayout>
    </MemoryRouter>
  );

const main = () => within(screen.getByRole('navigation', { name: 'Main' }));
const sectionBar = (name: string) => within(screen.getByRole('navigation', { name }));

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetGlobalConfig.mockReturnValue({
      ACCOUNT_FRONT_URL: 'http://account.example.com',
      LABEL_FRONT_URL: 'https://label.example.com'
    } as any);
  });

  it('renders children content', () => {
    anonymous();
    renderLayout();

    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('shows the shared Projects, Data and Labels groups', () => {
    anonymous();
    renderLayout();

    expect(main().getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/projects');
    expect(main().getByRole('link', { name: 'Data' })).toHaveAttribute('href', '/datasets');
    // The menu is identical in every app, so following a link across does not swap it out.
    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('href', 'https://label.example.com/jobs');
  });

  it('lists the Projects sections while in a training', () => {
    anonymous();
    renderLayout('/trainings/t1');

    expect(sectionBar('Projects').getByRole('link', { name: 'All projects' })).toHaveAttribute('href', '/projects');
    expect(sectionBar('Projects').getByRole('link', { name: 'Trainings' })).toHaveAttribute('aria-current', 'page');
  });

  it('sends label-front sections straight to label-front', () => {
    anonymous();
    renderLayout('/datasets/123');

    // No interstitial page in between — the entry is the label-front URL.
    expect(main().getByRole('link', { name: 'Labels' })).toHaveAttribute('href', 'https://label.example.com/jobs');
    expect(main().getByRole('link', { name: 'Data' })).toHaveAttribute('aria-current', 'true');
    // Datasets is Data's only section, so there is nothing to pick between.
    expect(screen.queryByRole('navigation', { name: 'Data' })).not.toBeInTheDocument();
  });

  it('drops label-front sections when label-front is unconfigured', () => {
    mockedGetGlobalConfig.mockReturnValue({} as any);
    anonymous();
    renderLayout('/datasets');

    // Better absent entries than ones that 404 inside Vision.
    expect(main().queryByRole('link', { name: 'Labels' })).not.toBeInTheDocument();
    expect(screen.queryByText('Bundles')).not.toBeInTheDocument();
    expect(main().getByRole('link', { name: 'Data' })).toBeInTheDocument();
  });

  it('shows the Login button when the user is not authenticated', () => {
    const login = vi.fn();
    mockedUseAuth.mockReturnValue({ user: null, isAuthenticated: false, login, logout: vi.fn() } as any);
    renderLayout();

    fireEvent.click(main().getByRole('button', { name: 'Login' }));

    expect(login).toHaveBeenCalled();
  });

  it('shows who is signed in, with Account sections on account-front', () => {
    signedIn();
    renderLayout();

    fireEvent.click(main().getByRole('button', { name: 'Account' }));

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      'http://account.example.com/account/profile'
    );
  });

  it('calls logout when the Logout menu item is clicked', () => {
    const logout = vi.fn();
    signedIn(logout);
    renderLayout();

    fireEvent.click(main().getByRole('button', { name: 'Account' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));

    expect(logout).toHaveBeenCalled();
  });
});
