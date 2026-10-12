import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@visin/frontend-core';
import GroupInvitationPage from './GroupInvitationPage';
import { tokenFromHash } from '../utils/invitationToken';

const state = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false, user: { id: 'member-ID', email: 'member@example.test' }, login: vi.fn(), signup: vi.fn() }));
const service = vi.hoisted(() => ({ previewInvitation: vi.fn(), acceptInvitation: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => state }));
vi.mock('../services/groupService', () => ({ groupService: service }));
const token = 'a'.repeat(64);
function Location() { const location = useLocation(); return <div data-testid="location">{location.pathname}{location.hash}</div>; }
function mount(entry = `/invite#${token}`) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Location /><Routes>
    <Route path="/invite" element={<GroupInvitationPage />} />
    <Route path="/account/groups" element={<div>My groups</div>} />
  </Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  state.isAuthenticated = true;
  state.isLoading = false;
  service.previewInvitation.mockResolvedValue({ name: 'Research', role: 'member', groupId: 'g1', expiresAt: '2026-09-17' });
  service.acceptInvitation.mockResolvedValue({ _id: 'g1' });
});
describe('group invitation acceptance', () => {
  it('previews without accepting and requires an explicit click', async () => {
    mount();
    expect(await screen.findByText('Join Research')).toBeInTheDocument();
    expect(service.previewInvitation).toHaveBeenCalledWith(token);
    expect(service.acceptInvitation).not.toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/invite$/);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await waitFor(() => expect(service.acceptInvitation).toHaveBeenCalledWith(token));
    expect(await screen.findByText('My groups')).toBeInTheDocument();
    expect(sessionStorage.getItem('visin-group-invitation')).toBeNull();
  });
  it('preserves the invitation for sign-in without putting the secret in the redirect URL', async () => {
    state.isAuthenticated = false;
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(state.login).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('visin-group-invitation')).toBe(token);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/invite$/);
    expect(service.previewInvitation).not.toHaveBeenCalled();
    expect(service.acceptInvitation).not.toHaveBeenCalled();
  });
  it('offers a new account as well as sign-in to someone signed out', async () => {
    state.isAuthenticated = false;
    mount();
    expect(screen.getByText(/not signed in to Visin in this browser/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(state.signup).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('visin-group-invitation')).toBe(token);
  });
  it('finds the token in a link that a mail or chat app has encoded or run punctuation into', async () => {
    expect(tokenFromHash(`#${token}).`)).toBe(token);
    expect(tokenFromHash(`#%20${token.toUpperCase()}`)).toBe(token);
    expect(tokenFromHash(`#100%${token}`)).toBe(token);
    // A longer run is a different string, not a token with something added.
    expect(tokenFromHash(`#${token}0`)).toBe('');
    expect(tokenFromHash('#abc')).toBe('');
    mount(`/invite#${token}.`);
    expect(await screen.findByText('Join Research')).toBeInTheDocument();
    expect(service.previewInvitation).toHaveBeenCalledWith(token);
  });
  it('treats an invitation to a group the account is already in as done, not as a failure', async () => {
    service.acceptInvitation.mockRejectedValue(new ApiError(409, 'Already a member of this group'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already a member of Research');
    expect(screen.getByRole('link', { name: 'Go to your groups' })).toHaveAttribute('href', '/account/groups');
    expect(sessionStorage.getItem('visin-group-invitation')).toBeNull();
  });
  it('resumes a saved invitation after sign-in', async () => {
    sessionStorage.setItem('visin-group-invitation', token);
    mount('/invite');
    expect(await screen.findByText('Join Research')).toBeInTheDocument();
    expect(service.acceptInvitation).not.toHaveBeenCalled();
  });
  it.each(['/invite', '/invite#bad'])('rejects an invalid or missing token (%s)', entry => {
    mount(entry);
    expect(screen.getByRole('alert')).toHaveTextContent('invalid');
    expect(service.previewInvitation).not.toHaveBeenCalled();
  });
  it('waits for authentication to initialize', () => {
    state.isLoading = true;
    state.isAuthenticated = false;
    mount();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
  it('shows expiration/revocation errors without an accept control', async () => {
    service.previewInvitation.mockRejectedValue(new Error('Invitation is invalid or expired'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent('expired');
    expect(screen.getByRole('alert')).toHaveTextContent('add you by name');
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument();
  });
  it('surfaces failed acceptance and permits a deliberate retry', async () => {
    service.acceptInvitation.mockRejectedValueOnce(new Error('Group changed concurrently'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('concurrently');
    expect(sessionStorage.getItem('visin-group-invitation')).toBe(token);
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('My groups')).toBeInTheDocument();
  });
});
