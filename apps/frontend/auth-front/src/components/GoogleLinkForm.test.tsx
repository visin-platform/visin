import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import GoogleLinkForm from './GoogleLinkForm';
import { initializeGoogleSignIn } from '../authFlow';
import { linkGoogle } from '../services/authApi';

vi.mock('../authFlow', () => ({ initializeGoogleSignIn: vi.fn() }));
vi.mock('../services/authApi', () => ({ linkGoogle: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

const choose = () => {
  fireEvent.change(screen.getByLabelText(/Current password/), { target: { value: 'current-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Choose Google account' }));
  return vi.mocked(initializeGoogleSignIn).mock.calls.at(-1)![2]!;
};

it('links only after password confirmation and a deliberate Google choice', async () => {
  render(<GoogleLinkForm clientId="client-id" />);
  expect(initializeGoogleSignIn).not.toHaveBeenCalled();
  const callback = choose();
  await act(async () => { callback({ credential: 'google-token' }); callback({ credential: 'duplicate' }); });
  expect(linkGoogle).toHaveBeenCalledExactlyOnceWith('current-password', 'google-token');
  expect(await screen.findByText('Google sign-in linked to this account.')).toBeInTheDocument();
});

it('shows a rejection and clears the password before retry', async () => {
  vi.mocked(linkGoogle).mockRejectedValue(new Error('Current password is incorrect'));
  render(<GoogleLinkForm clientId="client-id" />);
  const callback = choose();
  await act(async () => { callback({ credential: 'google-token' }); });
  expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
  expect(screen.getByLabelText(/Current password/)).toHaveValue('');
});

it('ignores stale Google callbacks after cancellation', async () => {
  render(<GoogleLinkForm clientId="client-id" />);
  const callback = choose();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel linking' }));
  await act(async () => { callback({ credential: 'google-token' }); });
  expect(linkGoogle).not.toHaveBeenCalled();
});

it.each([true, false])('ignores a late network result after leaving the form (success=%s)', async success => {
  let finish!: () => void;
  vi.mocked(linkGoogle).mockImplementation(() => new Promise((resolve, reject) => { finish = () => success ? resolve() : reject(new Error('late error')); }));
  const { unmount } = render(<GoogleLinkForm clientId="client-id" />);
  const callback = choose();
  act(() => { callback({ credential: 'google-token' }); });
  unmount();
  await act(async () => { finish(); });
});
