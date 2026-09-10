import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: () => ({ GROUP_SERVICE_URL: 'http://group-api.test' })
}));

import { groupService } from './groupService';

const group = { _id: 'g1', name: 'Team', members: [] };

const stubFetch = (body: unknown = { success: true, data: group }, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue(
    status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('groupService reads', () => {
  it('lists my groups', async () => {
    const fetchMock = stubFetch({ success: true, data: [group] });

    await expect(groupService.listMine()).resolves.toEqual([group]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://group-api.test/api/groups/mine');
    // group-service authenticates browsers via the shared access_token cookie.
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
  });

  it('lists deleted groups', async () => {
    const fetchMock = stubFetch({ success: true, data: [] });

    await expect(groupService.listDeleted()).resolves.toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://group-api.test/api/groups/mine/deleted');
  });
});

describe('groupService group mutations', () => {
  it('creates a group', async () => {
    const fetchMock = stubFetch();

    await expect(groupService.create('Team')).resolves.toEqual(group);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ name: 'Team' }));
  });

  it('renames a group', async () => {
    const fetchMock = stubFetch();

    await groupService.rename('g1', 'New');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups/g1');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ name: 'New' }));
  });

  it('soft-deletes a group', async () => {
    const fetchMock = stubFetch(undefined, 204);

    await expect(groupService.remove('g1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups/g1');
    expect(init.method).toBe('DELETE');
  });

  it('restores a group', async () => {
    const fetchMock = stubFetch();

    await expect(groupService.restore('g1')).resolves.toEqual(group);
    expect(fetchMock.mock.calls[0][0]).toBe('http://group-api.test/api/groups/g1/restore');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('permanently deletes a group', async () => {
    const fetchMock = stubFetch(undefined, 204);

    await groupService.deleteForever('g1');
    expect(fetchMock.mock.calls[0][0]).toBe('http://group-api.test/api/groups/g1/permanent');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('groupService member mutations', () => {
  it('creates an invitation', async () => {
    const fetchMock = stubFetch();

    await groupService.createInvitation('g1', 'admin');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups/g1/invitations');
    expect(init.body).toBe(JSON.stringify({ role: 'admin' }));
  });

  it('updates a member role, encoding the account ID in the path', async () => {
    const fetchMock = stubFetch();

    await groupService.updateMemberRole('g1', 'a+b@x.com', 'member');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups/g1/members/a%2Bb%40x.com');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ role: 'member' }));
  });

  it('removes a member', async () => {
    const fetchMock = stubFetch();

    await groupService.removeMember('g1', 'member@x.com');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://group-api.test/api/groups/g1/members/member%40x.com');
    expect(init.method).toBe('DELETE');
  });

  it('surfaces the service message on rejection', async () => {
    stubFetch({ message: 'Group must have at least one owner' }, 409);

    await expect(groupService.removeMember('g1', 'owner@x.com')).rejects.toThrow(
      'Group must have at least one owner'
    );
  });
});

describe('base URL', () => {
  it('falls back to an empty base URL when GROUP_SERVICE_URL is unconfigured', async () => {
    vi.doMock('../config/ConfigProvider', () => ({ getGlobalConfig: () => ({}) }));
    vi.resetModules();
    const { groupService: fresh } = await import('./groupService');
    const fetchMock = stubFetch({ success: true, data: [] });

    await fresh.listMine();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/groups/mine');
    vi.doUnmock('../config/ConfigProvider');
  });
});

it('revokes pending invitations', async () => {
  const fetchMock = stubFetch(undefined, 204);
  await groupService.revokeInvitations('g1');
  expect(fetchMock.mock.calls[0][0]).toContain('/g1/invitations');
  expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
});
it.each(['previewInvitation', 'acceptInvitation'] as const)('%s sends the secret only in the request body', async action => {
  const fetchMock = stubFetch();
  await groupService[action]('secret-token');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toContain(action === 'previewInvitation' ? '/invitations/preview' : '/invitations/accept');
  expect(url).not.toContain('secret-token');
  expect(init.body).toBe(JSON.stringify({ token: 'secret-token' }));
  expect(init.method).toBe('POST');
});
