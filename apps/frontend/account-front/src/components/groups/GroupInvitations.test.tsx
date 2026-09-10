import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GroupInvitations from './GroupInvitations';
const service = vi.hoisted(() => ({ createInvitation: vi.fn(), revokeInvitations: vi.fn() }));
vi.mock('../../services/groupService', () => ({ groupService: service }));
const wrap = (canInviteOwner = true) => <QueryClientProvider client={new QueryClient()}><GroupInvitations groupId="g1" canInviteOwner={canInviteOwner} /></QueryClientProvider>;
beforeEach(() => {
  vi.clearAllMocks();
  service.createInvitation.mockResolvedValue({ token: 'a'.repeat(64) });
  service.revokeInvitations.mockResolvedValue(undefined);
});
it('copies the invitation and supports manual copy when the clipboard is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(wrap());
  fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Copy link' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite#${'a'.repeat(64)}`));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('manually');
});
it('reports revocation failure', async () => {
  service.revokeInvitations.mockRejectedValue(new Error('Revocation unavailable'));
  render(wrap(false));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke pending invites' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Revocation unavailable');
});
it('sends the selected owner role and prevents stale owner selection after demotion', async () => {
  const client = new QueryClient();
  const ui = (canInviteOwner: boolean) => <QueryClientProvider client={client}><GroupInvitations groupId="g1" canInviteOwner={canInviteOwner} /></QueryClientProvider>;
  const view = render(ui(true));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Invitation role' }));
  fireEvent.click(screen.getByRole('option', { name: 'owner' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
  await waitFor(() => expect(service.createInvitation).toHaveBeenCalledWith('g1', 'owner'));
  await screen.findByRole('button', { name: 'Copy link' });
  view.rerender(ui(false));
  fireEvent.click(screen.getByRole('button', { name: 'Create invite link' }));
  await waitFor(() => expect(service.createInvitation).toHaveBeenCalledWith('g1', 'member'));
});
