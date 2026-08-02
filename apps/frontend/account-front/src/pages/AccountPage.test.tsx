import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AccountPage from './AccountPage';

vi.mock('../components/tabs/ProfileTab', () => ({ default: () => <div>profile-tab</div> }));
vi.mock('../components/tabs/GroupsTab', () => ({ default: () => <div>groups-tab</div> }));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountPage />
    </MemoryRouter>
  );

describe('AccountPage', () => {
  it('redirects the index route to profile', () => {
    renderAt('/');

    expect(screen.getByText('profile-tab')).toBeInTheDocument();
  });

  it('renders the profile tab', () => {
    renderAt('/profile');
    expect(screen.getByText('profile-tab')).toBeInTheDocument();
  });

  it('renders the groups tab', () => {
    renderAt('/groups');
    expect(screen.getByText('groups-tab')).toBeInTheDocument();
  });
});
