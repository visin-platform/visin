import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '@visin/frontend-core';
import ProfileTab from './ProfileTab';

// The devices list has its own suite (SessionsCard.test.tsx).
vi.mock('./SessionsCard', () => ({ default: () => null }));
vi.mock('../../utils/resizeImage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/resizeImage')>()),
  resizeToAvatar: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'image/webp' })),
}));

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ProfileTab />
      </MemoryRouter>
    </QueryClientProvider>
  );

vi.mock('../../services/authService', () => ({
  authService: { getProfile: vi.fn() },
}));
vi.mock('../../services/profileService', () => ({
  profileService: { updateProfile: vi.fn(), changePassword: vi.fn(), uploadPicture: vi.fn(), removePicture: vi.fn() },
}));

import { authService } from '../../services/authService';
import { profileService } from '../../services/profileService';

const mockedGetProfile = authService.getProfile as ReturnType<typeof vi.fn>;
const mockedUpdateProfile = profileService.updateProfile as ReturnType<typeof vi.fn>;
const mockedChangePassword = profileService.changePassword as ReturnType<typeof vi.fn>;

const user = { id: 'u1', email: 'test@example.com', firstName: 'Ada', lastName: 'Lovelace', name: 'Ada Lovelace' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProfileTab', () => {
  it('shows a spinner while loading, then populates fields from the profile', async () => {
    mockedGetProfile.mockResolvedValue(user);
    renderTab();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByDisplayValue('Ada')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
  });

  it('shows an error message when loading the profile fails', async () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    renderTab();

    await waitFor(() => expect(screen.getByText('Failed to load user data')).toBeInTheDocument());
  });

  it('leaves Save disabled until a field actually changes', async () => {
    mockedGetProfile.mockResolvedValue(user);
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });

    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
  });

  it('saves changes and shows a success message', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({
      success: true,
      user: { ...user, firstName: 'Grace' },
    });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Profile updated successfully')).toBeInTheDocument());
    expect(mockedUpdateProfile).toHaveBeenCalledWith({
      firstName: 'Grace',
      lastName: 'Lovelace',
      bio: '',
      links: [],
      profilePublic: false,
      showActivity: true
    });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('trims whitespace in the request payload', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: true, user });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: '  Grace ' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({
      firstName: 'Grace',
      lastName: 'Lovelace',
      bio: '',
      links: [],
      profilePublic: false,
      showActivity: true
    })
    );
  });

  it('shows the server message when the update response reports failure', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: false, message: 'Name too long' });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Name too long')).toBeInTheDocument());
  });

  it('shows a generic error when the update request throws', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockRejectedValue(new Error('boom'));
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Failed to update profile')).toBeInTheDocument());
  });

  it('cancel reverts unsaved changes', async () => {
    mockedGetProfile.mockResolvedValue(user);
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('closes the alert when dismissed', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: true, user });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => screen.getByText('Profile updated successfully'));

    fireEvent.click(screen.getByLabelText(/close/i));

    expect(screen.queryByText('Profile updated successfully')).not.toBeInTheDocument();
  });

  it('updates last name', async () => {
    mockedGetProfile.mockResolvedValue(user);
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Hopper' } });
    expect(screen.getByDisplayValue('Hopper')).toBeInTheDocument();
  });

  it('falls back to empty names when the profile has none, and cancel restores that', async () => {
    mockedGetProfile.mockResolvedValue({ id: 'u2', email: 'blank@example.com', name: 'Blank' });
    renderTab();
    await waitFor(() => expect(screen.getByDisplayValue('blank@example.com')).toBeInTheDocument());

    expect(screen.getByLabelText('First Name')).toHaveValue('');
    expect(screen.getByLabelText('Last Name')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Temp' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByLabelText('First Name')).toHaveValue('');
  });

  it('falls back to a generic message when the failure response has none', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: false });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Failed to update profile')).toBeInTheDocument());
  });

  it('does nothing when getProfile resolves with no user', async () => {
    mockedGetProfile.mockResolvedValue(null);
    renderTab();

    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByLabelText('First Name')).toHaveValue('');
  });
});

describe('ProfileTab password section', () => {
  it('offers to set a password for a Google-created account', async () => {
    mockedGetProfile.mockResolvedValue({ ...user, hasPassword: false });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    expect(screen.getByRole('heading', { name: /set a password/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('offers to change it for an account that already has one', async () => {
    mockedGetProfile.mockResolvedValue({ ...user, hasPassword: true });
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it('switches to the change form once a password has been set', async () => {
    mockedGetProfile.mockResolvedValue({ ...user, hasPassword: false });
    mockedChangePassword.mockResolvedValue('Password set');
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: 'a-strong-password' } });
    fireEvent.change(screen.getByLabelText(/^confirm new password$/i), { target: { value: 'a-strong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    // The card reflects the new state without needing a page reload.
    expect(await screen.findByRole('heading', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });
});

describe('ProfileTab public profile', () => {
  const profile = {
    ...user,
    handle: 'ada',
    bio: 'Analytical engines',
    links: ['https://ada.example.test'],
    profilePublic: true,
  };
  const open = async (value: object = profile) => {
    mockedGetProfile.mockResolvedValue(value);
    renderTab();
    await waitFor(() => screen.getByDisplayValue('Ada'));
  };
  const save = () => fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

  it('shows the page the person has, and the way to see it', async () => {
    await open();

    expect(screen.getByLabelText('Handle')).toHaveValue('ada');
    expect(screen.getByLabelText('Bio')).toHaveValue('Analytical engines');
    expect(screen.getByLabelText('Link 1')).toHaveValue('https://ada.example.test');
    expect(screen.queryByLabelText('Link 2')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Show my public page' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'View your page' })).toHaveAttribute('href', '/u/ada');
    expect(screen.getByText(/Your page is \/u\/ada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('saves a new handle, bio and links, each in a box of its own, lowercased and trimmed', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: { ...profile, handle: 'ada-l', bio: 'Notes' , links: ['https://a.test', 'https://b.test'] } });

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'Ada-L' } });
    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '  Notes ' } });
    fireEvent.change(screen.getByLabelText('Link 1'), { target: { value: ' https://a.test ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    fireEvent.change(screen.getByLabelText('Link 3'), { target: { value: 'https://b.test' } });
    // Link 2 is left blank: it is not a link.
    save();

    await waitFor(() => expect(screen.getByText('Profile updated successfully')).toBeInTheDocument());
    expect(mockedUpdateProfile).toHaveBeenCalledWith({
      firstName: 'Ada',
      lastName: 'Lovelace',
      handle: 'ada-l',
      bio: 'Notes',
      links: ['https://a.test', 'https://b.test'],
      profilePublic: true,
      showActivity: true,
    });
    // The form now shows what was saved, so there is nothing left to save.
    expect(screen.getByLabelText('Link 1')).toHaveValue('https://a.test');
    expect(screen.getByLabelText('Link 2')).toHaveValue('https://b.test');
    expect(screen.queryByLabelText('Link 3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('does not ask for the handle it already has', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: profile });

    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'New bio' } });
    save();

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalled());
    expect(mockedUpdateProfile.mock.calls[0][0]).not.toHaveProperty('handle');
  });

  it('does not send an emptied handle, which would only be refused', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: profile });

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: '' } });
    save();

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalled());
    expect(mockedUpdateProfile.mock.calls[0][0]).not.toHaveProperty('handle');
  });

  it('hides the page from the switch, and says what that does', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: { ...profile, profilePublic: false } });

    fireEvent.click(screen.getByRole('switch', { name: 'Show my public page' }));

    expect(screen.getByText(/no place in search or the People directory/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View your page' })).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ profilePublic: false })));
  });

  it('says why a handle was refused, in the server\'s words', async () => {
    await open();
    mockedUpdateProfile.mockRejectedValue(new ApiError(409, 'That handle is taken'));

    fireEvent.change(screen.getByLabelText('Handle'), { target: { value: 'taken' } });
    save();

    expect(await screen.findByText('That handle is taken')).toBeInTheDocument();
  });

  it('keeps a failure that is not the person\'s to fix generic', async () => {
    await open();
    mockedUpdateProfile.mockRejectedValue(new ApiError(500, 'stack trace'));

    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'x' } });
    save();

    expect(await screen.findByText('Failed to update profile')).toBeInTheDocument();
    expect(screen.queryByText('stack trace')).not.toBeInTheDocument();
  });

  it('shows an uploaded picture at once and without asking to save, and drops it again on removal', async () => {
    await open();
    const picture = 'https://auth.example.test/auth/avatars/u1?v=1';
    vi.mocked(profileService.uploadPicture).mockResolvedValue(picture);
    vi.mocked(profileService.removePicture).mockResolvedValue();

    fireEvent.change(screen.getByTestId('picture-input'), { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } });

    await waitFor(() => expect(document.querySelector(`img[src="${picture}"]`)).not.toBeNull());
    expect(screen.getByRole('button', { name: /Save Changes/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(document.querySelector(`img[src="${picture}"]`)).toBeNull());
  });

  it('adds and removes link boxes, and offers no ninth', async () => {
    await open();

    for (let count = 1; count < 8; count++) fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(screen.getByLabelText('Link 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeDisabled();
    expect(screen.getByText(/That is the most \(8\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove link 8' }));
    expect(screen.queryByLabelText('Link 8')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeEnabled();
  });

  it('clears the links when the last one is removed', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: { ...profile, links: [] } });

    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));
    // A single empty box stays, so there is always somewhere to type; it has nothing left to remove.
    expect(screen.getByLabelText('Link 1')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Remove link 1' })).toBeDisabled();
    save();

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalled());
    expect(mockedUpdateProfile.mock.calls[0][0]).toMatchObject({ links: [] });
  });

  it('does not count a box left blank as a change', async () => {
    await open();

    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('puts the saved page back on cancel', async () => {
    await open();

    fireEvent.change(screen.getByLabelText('Bio'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Show my public page' }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByLabelText('Bio')).toHaveValue('Analytical engines');
    expect(screen.getByRole('switch', { name: 'Show my public page' })).toBeChecked();
  });

  it('keeps the timeline off the page when asked, and says what it is', async () => {
    await open();
    mockedUpdateProfile.mockResolvedValue({ success: true, user: { ...profile, showActivity: false } });

    expect(screen.getByRole('switch', { name: 'Show my recent activity on my page' })).toBeChecked();
    expect(screen.getByText(/Never anything private/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Show my recent activity on my page' }));
    save();

    await waitFor(() => expect(mockedUpdateProfile).toHaveBeenCalledWith(expect.objectContaining({ showActivity: false })));
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Show my recent activity on my page' })).not.toBeChecked());
  });

  it('starts an account that predates handles empty and hidden, with no page to view yet', async () => {
    await open(user);

    expect(screen.getByLabelText('Handle')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Show my public page' })).not.toBeChecked();
    expect(screen.getByText(/no place in search or the People directory/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'View your page' })).not.toBeInTheDocument();
    expect(screen.getByText(/Your page is \/u\/handle/)).toBeInTheDocument();
  });
});
