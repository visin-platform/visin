import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProfileTab from './ProfileTab';

vi.mock('../../services/authService', () => ({
  authService: { getProfile: vi.fn() },
}));
vi.mock('../../services/profileService', () => ({
  profileService: { updateProfile: vi.fn() },
}));

import { authService } from '../../services/authService';
import { profileService } from '../../services/profileService';

const mockedGetProfile = authService.getProfile as ReturnType<typeof vi.fn>;
const mockedUpdateProfile = profileService.updateProfile as ReturnType<typeof vi.fn>;

const user = { id: 'u1', email: 'test@example.com', firstName: 'Ada', lastName: 'Lovelace', name: 'Ada Lovelace' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProfileTab', () => {
  it('shows a spinner while loading, then populates fields from the profile', async () => {
    mockedGetProfile.mockResolvedValue(user);
    render(<ProfileTab />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByDisplayValue('Ada')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('test@example.com')).toBeInTheDocument();
  });

  it('shows an error message when loading the profile fails', async () => {
    mockedGetProfile.mockRejectedValue(new Error('network down'));
    render(<ProfileTab />);

    await waitFor(() => expect(screen.getByText('Failed to load user data')).toBeInTheDocument());
  });

  it('leaves Save disabled until a field actually changes', async () => {
    mockedGetProfile.mockResolvedValue(user);
    render(<ProfileTab />);
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
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Profile updated successfully')).toBeInTheDocument());
    expect(mockedUpdateProfile).toHaveBeenCalledWith({ firstName: 'Grace', lastName: 'Lovelace' });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('trims whitespace in the request payload', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: true, user });
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: '  Grace ' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(mockedUpdateProfile).toHaveBeenCalledWith({ firstName: 'Grace', lastName: 'Lovelace' })
    );
  });

  it('shows the server message when the update response reports failure', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: false, message: 'Name too long' });
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Name too long')).toBeInTheDocument());
  });

  it('shows a generic error when the update request throws', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockRejectedValue(new Error('boom'));
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Failed to update profile')).toBeInTheDocument());
  });

  it('cancel reverts unsaved changes', async () => {
    mockedGetProfile.mockResolvedValue(user);
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByDisplayValue('Ada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('closes the alert when dismissed', async () => {
    mockedGetProfile.mockResolvedValue(user);
    mockedUpdateProfile.mockResolvedValue({ success: true, user });
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => screen.getByText('Profile updated successfully'));

    fireEvent.click(screen.getByLabelText(/close/i));

    expect(screen.queryByText('Profile updated successfully')).not.toBeInTheDocument();
  });

  it('updates last name and the notifications toggle', async () => {
    mockedGetProfile.mockResolvedValue(user);
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('Last Name'), { target: { value: 'Hopper' } });
    expect(screen.getByDisplayValue('Hopper')).toBeInTheDocument();

    const notificationsSwitch = screen.getByRole('switch');
    expect(notificationsSwitch).toBeChecked();
    fireEvent.click(notificationsSwitch);
    expect(notificationsSwitch).not.toBeChecked();
  });

  it('falls back to empty names when the profile has none, and cancel restores that', async () => {
    mockedGetProfile.mockResolvedValue({ id: 'u2', email: 'blank@example.com', name: 'Blank' });
    render(<ProfileTab />);
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
    render(<ProfileTab />);
    await waitFor(() => screen.getByDisplayValue('Ada'));

    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText('Failed to update profile')).toBeInTheDocument());
  });

  it('does nothing when getProfile resolves with no user', async () => {
    mockedGetProfile.mockResolvedValue(null);
    render(<ProfileTab />);

    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByLabelText('First Name')).toHaveValue('');
  });
});
