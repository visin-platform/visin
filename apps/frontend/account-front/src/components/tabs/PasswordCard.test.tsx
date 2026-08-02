import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PasswordCard from './PasswordCard';

const changePassword = vi.hoisted(() => vi.fn());
vi.mock('../../services/profileService', () => ({ profileService: { changePassword } }));

const onChanged = vi.fn();

const fill = (values: Record<string, string>) => {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}$`, 'i')), { target: { value } });
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  changePassword.mockResolvedValue('Password set');
});

describe('PasswordCard without an existing password', () => {
  const renderCard = () => render(<PasswordCard hasPassword={false} onChanged={onChanged} />);

  it('explains why there is no password and omits the current-password field', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: /set a password/i })).toBeInTheDocument();
    expect(screen.getByText(/you signed in with google/i)).toBeInTheDocument();
    // Nothing to confirm against, so asking would make it unsettable.
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it('sets the password without a current one', async () => {
    renderCard();

    fill({ 'New password': 'a-strong-password', 'Confirm new password': 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith({ newPassword: 'a-strong-password' }));
    expect(await screen.findByText('Password set')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('clears the fields after success', async () => {
    renderCard();

    fill({ 'New password': 'a-strong-password', 'Confirm new password': 'a-strong-password' });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));

    await screen.findByText('Password set');
    expect(screen.getByLabelText(/^new password$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^confirm new password$/i)).toHaveValue('');
  });
});

describe('PasswordCard with an existing password', () => {
  const renderCard = () => render(<PasswordCard hasPassword onChanged={onChanged} />);

  it('warns that other sessions end, and requires the current password', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument();
    expect(screen.getByText(/signs out every other device/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it('keeps submit disabled until the current password is supplied', () => {
    renderCard();

    fill({ 'New password': 'a-strong-password', 'Confirm new password': 'a-strong-password' });

    expect(screen.getByRole('button', { name: 'Update password' })).toBeDisabled();
  });

  it('sends both passwords', async () => {
    renderCard();

    fill({
      'Current password': 'the-old-password',
      'New password': 'a-strong-password',
      'Confirm new password': 'a-strong-password'
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'the-old-password',
        newPassword: 'a-strong-password'
      })
    );
  });

  it('surfaces the server message when the current password is wrong', async () => {
    changePassword.mockRejectedValue(new Error('Current password is incorrect'));
    renderCard();

    fill({
      'Current password': 'wrong',
      'New password': 'a-strong-password',
      'Confirm new password': 'a-strong-password'
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('PasswordCard validation', () => {
  it('blocks a password under the length floor', () => {
    render(<PasswordCard hasPassword={false} onChanged={onChanged} />);

    fill({ 'New password': 'short', 'Confirm new password': 'short' });

    expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled();
  });

  it('blocks and explains a confirmation mismatch', () => {
    render(<PasswordCard hasPassword={false} onChanged={onChanged} />);

    fill({ 'New password': 'a-strong-password', 'Confirm new password': 'a-strong-passwore' });

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set password' })).toBeDisabled();
    expect(changePassword).not.toHaveBeenCalled();
  });
});
