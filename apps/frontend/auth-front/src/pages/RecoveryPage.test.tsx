import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RecoveryPage from './RecoveryPage';
const config = { AUTH_SERVICE_URL: 'https://auth-api.example.test' as string | undefined };
vi.mock('../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));
beforeEach(() => {
  config.AUTH_SERVICE_URL = 'https://auth-api.example.test';
  window.history.replaceState(null, '', '/recover#token=' + 'a'.repeat(64));
});
afterEach(() => vi.unstubAllGlobals());
function show() {
  render(
    <BrowserRouter>
      <Routes>
        <Route path="/recover" element={<RecoveryPage />} />
        <Route path="/" element={<div>Sign in page</div>} />
      </Routes>
    </BrowserRouter>
  );
}
function fill() {
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'replacement-password' } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'replacement-password' } });
}
it('removes the token fragment and completes recovery without signing in automatically', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
  vi.stubGlobal('fetch', fetcher);
  show();
  expect(window.location.hash).toBe('');
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText(/Your password was replaced/)).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledWith(
    'https://auth-api.example.test/auth/recover',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ token: 'a'.repeat(64), password: 'replacement-password' })
    })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Sign in page')).toBeInTheDocument();
});
it('requires a complete link and matching passwords', () => {
  window.history.replaceState(null, '', '/recover');
  show();
  fill();
  expect(screen.getByRole('button', { name: 'Set new password' })).toBeDisabled();
  expect(screen.getByText(/Open the complete recovery link/)).toBeInTheDocument();
});
it('shows expired-link errors without losing the password fields', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Recovery link expired' }), { status: 400 }))
  );
  show();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText('Recovery link expired')).toBeInTheDocument();
  expect(screen.getByLabelText('New password')).toHaveValue('replacement-password');
});
it('handles missing configuration and network failures', async () => {
  config.AUTH_SERVICE_URL = undefined;
  show();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText('Authentication is not configured')).toBeInTheDocument();
  config.AUTH_SERVICE_URL = 'https://auth-api.example.test';
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue('network failure'));
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  expect(await screen.findByText('Recovery could not be completed')).toBeInTheDocument();
});
it('uses a safe fallback when the server supplies no error message', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
  show();
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  await waitFor(() => expect(screen.getByText('Recovery could not be completed')).toBeInTheDocument());
});
