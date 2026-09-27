import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const service = vi.hoisted(() => ({ activity: vi.fn() }));
vi.mock('../../services/groupService', () => ({ groupService: service }));

import GroupActivity from './GroupActivity';
import { describeEvent, type GroupActivityEvent } from '../../types/group';

const renderActivity = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <GroupActivity groupId="g1" />
    </QueryClientProvider>
  );

const event = (fields: Partial<GroupActivityEvent>): GroupActivityEvent => ({
  _id: 'e1',
  at: '2026-09-27T10:00:00.000Z',
  resourceType: 'project',
  resourceId: 'p1',
  resourceName: 'Road',
  action: 'trash',
  actorId: 'u1',
  ...fields
});

describe('GroupActivity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads only when asked, then lists what happened and who did it', async () => {
    service.activity.mockResolvedValue([
      event({ actorEmail: 'admin@example.test' }),
      event({ _id: 'e2', action: 'visibility', visibility: 'public', resourceType: 'dataset', resourceName: 'Frames' })
    ]);
    renderActivity();
    expect(service.activity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));

    expect(await screen.findByText('Moved project "Road" to the trash')).toBeInTheDocument();
    expect(screen.getByText(/admin@example\.test/)).toBeInTheDocument();
    expect(screen.getByText('Made dataset "Frames" public')).toBeInTheDocument();
    expect(screen.getByText(/Someone no longer in the group/)).toBeInTheDocument();
    expect(service.activity).toHaveBeenCalledWith('g1');
  });

  it('says when there is nothing yet, and shows a refusal', async () => {
    service.activity.mockResolvedValueOnce([]);
    const { unmount } = renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument();
    unmount();

    service.activity.mockRejectedValueOnce(new Error("Only the group's owners and admins can see its activity"));
    renderActivity();
    fireEvent.click(screen.getByRole('button', { name: 'Show activity' }));
    expect(await screen.findByText(/owners and admins/)).toBeInTheDocument();
  });
});

describe('describeEvent', () => {
  it('reads each action as a sentence, from the group’s side of a transfer', () => {
    expect(describeEvent(event({ action: 'transfer', to: { kind: 'group', id: 'g1' } }), 'g1')).toBe(
      'Transferred project "Road" to this group'
    );
    expect(describeEvent(event({ action: 'transfer', to: { kind: 'user', id: 'u2' } }), 'g1')).toBe(
      'Transferred project "Road" away from this group'
    );
    expect(describeEvent(event({ action: 'visibility', visibility: 'private' }), 'g1')).toBe(
      'Made project "Road" private'
    );
    expect(describeEvent(event({ action: 'restore' }), 'g1')).toBe('Restored project "Road" from the trash');
    expect(describeEvent(event({ action: 'purge', resourceName: undefined }), 'g1')).toBe(
      'Deleted project "p1" for good'
    );
  });
});
