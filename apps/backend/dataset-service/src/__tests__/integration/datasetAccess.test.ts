jest.mock('../../clients/projectServiceClient', () => ({
  projectDatasetOwner: jest.fn(async () => ({ kind: 'user', id: '000000000000000000000001' }))
}));
jest.mock('../../clients/fileServiceClient', () => jest.requireActual('../fixtures/fileStore').fileStore.client);
jest.mock('../../clients/hubClient', () => ({ fetchDatasetInfo: jest.fn() }));
jest.mock('../../clients/ownerIdentityClient', () => ({ lookupOwnerIdentities: jest.fn(async () => new Map()) }));
jest.mock('../../clients/groupServiceClient', () => ({ checkMembership: jest.fn(), getMyGroups: jest.fn() }));
jest.mock('../../queue/importQueue', () => ({
  enqueueImport: jest.fn(),
  enqueueScan: jest.fn(),
  enqueueDelete: jest.fn(),
  enqueueRemoveGroup: jest.fn(),
  removeQueuedImport: jest.fn()
}));

import { createApiKey } from '@visin/backend-core';
import { projectDatasetOwner } from '../../clients/projectServiceClient';
import { lookupOwnerIdentities } from '../../clients/ownerIdentityClient';
import { Dataset } from '../../models/Dataset';
import { ADMIN, GROUP, GROUP_OWNER, MEMBER, OWNER, STRANGER, baseUrl, call, createDataset, groupDataset, roles, useDatasetApi, type Body } from '../fixtures/datasetApi';

useDatasetApi();

describe('who can see a dataset', () => {
  it('shows a public one to everyone, a private one to its owner, and a group one to its members only', async () => {
    await createDataset();
    await createDataset({ name: 'Mine only' });
    const teamId = await groupDataset();

    const names = async (user?: string, query = '') =>
      ((await call(`/api/datasets${query}`, { user })).body.data.datasets as { name: string }[])
        .map((row) => row.name)
        .sort();
    expect(await names()).toEqual(['Public set']);
    expect(await names(STRANGER)).toEqual(['Public set']);
    expect(await names(OWNER)).toEqual(['Mine only', 'Public set']);
    expect(await names(MEMBER)).toEqual(['Public set', 'Team set']);
    expect(await names(OWNER, '?owner=me')).toEqual(['Mine only', 'Public set']);
    // Explore asks for public ones only, so a member's own private datasets do not mix in.
    expect(await names(OWNER, '?visibility=public')).toEqual(['Public set']);
    expect(await names(MEMBER, '?visibility=public')).toEqual(['Public set']);
    expect((await call('/api/datasets?visibility=private', { user: OWNER })).status).toBe(400);
    // An anonymous visitor owns nothing, even among public datasets.
    expect(await names(undefined, '?owner=me')).toEqual([]);
    expect(await names(MEMBER, `?owner=${GROUP}`)).toEqual(['Team set']);
    expect((await call('/api/datasets?search=team', { user: MEMBER })).body.data.pagination.total).toBe(1);

    expect((await call(`/api/datasets/${teamId}`)).status).toBe(401);
    expect((await call(`/api/datasets/${teamId}`, { user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${teamId}`, { user: ADMIN })).body.data).toMatchObject({
      owner: { kind: 'group', id: GROUP, name: 'Team' },
      createdBy: MEMBER,
      visibility: 'private',
      permissions: { read: true, contribute: true, manage: true, own: false }
    });
    expect((await call('/api/datasets/not-an-id')).status).toBe(404);

    // One the old service made after the owner migration ran: out of sight until it has an owner.
    const unowned = (
      await Dataset.collection.insertOne({
        name: 'Unowned',
        ownerId: OWNER,
        visibility: 'public',
        storagePrefix: 'x/',
        groups: [],
        holds: [],
        imageCount: 0
      })
    ).insertedId;
    expect(await names()).toEqual(['Public set']);
    expect((await call(`/api/datasets/${unowned}`, { user: OWNER })).status).toBe(404);
  });

  it('gives each group role its permissions, and a removed uploader none', async () => {
    const id = await groupDataset();
    const permissions = async (user: string) => (await call(`/api/datasets/${id}`, { user })).body.data.permissions;
    expect(await permissions(MEMBER)).toEqual({ read: true, contribute: true, manage: false, own: false });
    expect(await permissions(GROUP_OWNER)).toEqual({ read: true, contribute: true, manage: true, own: true });

    delete roles[MEMBER];
    expect((await call(`/api/datasets/${id}`, { user: MEMBER })).status).toBe(403);
    expect((await call('/api/datasets', { user: MEMBER })).body.data.datasets).toEqual([]);
    expect((await call(`/api/datasets/${id}/download`, { user: MEMBER })).status).toBe(403);
    expect(
      (
        await call(`/api/datasets/${id}/archive/upload-url`, {
          method: 'POST',
          user: MEMBER,
          body: { filename: 'x.zip' }
        })
      ).status
    ).toBe(403);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: MEMBER })).status).toBe(403);
    // The group keeps it.
    expect((await call(`/api/datasets/${id}`, { user: ADMIN })).status).toBe(200);
  });

  it('lists the groups a dataset can belong to', async () => {
    expect((await call('/api/datasets/groups')).status).toBe(401);
    expect((await call('/api/datasets/groups', { user: MEMBER })).body.data).toEqual([
      { id: GROUP, name: 'Team', role: 'member' }
    ]);
  });
});

describe('a pipeline key limited to one project', () => {
  const pipelineKey = async (scopes: ('vision:read' | 'vision:write' | 'dataset:read')[]) =>
    (
      await createApiKey({
        userId: OWNER,
        userEmail: `${OWNER}@example.test`,
        userName: 'Owner',
        name: 'pipeline',
        scopes,
        project: { id: '0000000000000000000000cc', name: 'road-seg' }
      })
    ).token;
  const withKey = (path: string, token: string, method = 'GET') =>
    fetch(`${baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token}` } }).then(async (response) => ({
      status: response.status,
      body: (await response.json()) as Body
    }));

  it('reads public datasets and its project owner’s private datasets', async () => {
    const publicId = await createDataset({ name: 'Public set', visibility: 'public' });
    const privateId = await createDataset({ name: 'Private set' });
    const token = await pipelineKey(['vision:read', 'vision:write']);

    expect((await withKey(`/api/datasets/${publicId}`, token)).status).toBe(200);
    const listed = await withKey('/api/datasets', token);
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.body)).toContain('Public set');
    expect(JSON.stringify(listed.body)).toContain('Private set');
    expect((await withKey(`/api/datasets/${privateId}`, token)).status).toBe(200);
    const otherId = await createDataset({ name: 'Other private' }, STRANGER);
    expect((await withKey(`/api/datasets/${otherId}`, token)).status).toBe(403);
  });

  it('downloads its group owner’s archive but cannot discover unrelated groups or trash', async () => {
    const id = await groupDataset();
    await Dataset.updateOne(
      { _id: id },
      { $set: { archive: { fileId: 'archive', filename: 'set.zip', size: 42, uploadedAt: new Date() } } }
    );
    jest.mocked(projectDatasetOwner).mockResolvedValue({ kind: 'group', id: GROUP });
    const token = await pipelineKey(['vision:write']);
    expect((await withKey(`/api/datasets/${id}/download`, token)).body.data).toMatchObject({
      downloadUrl: 'signed:archive'
    });
    expect((await withKey('/api/datasets/groups', token)).status).toBe(403);
    expect((await withKey('/api/datasets/trash', token)).status).toBe(403);
    const ownId = await createDataset({ name: 'Personal private' });
    expect((await withKey(`/api/datasets/${ownId}`, token)).status).toBe(403);
    jest
      .mocked(projectDatasetOwner)
      .mockRejectedValueOnce(new (jest.requireActual('@visin/backend-core').ForbiddenError)('No live contribution'));
    expect((await withKey(`/api/datasets/${id}/download`, token)).status).toBe(403);
  });

  it('cannot change a dataset, even its owner’s', async () => {
    const id = await createDataset({ name: 'Public set', visibility: 'public' });

    expect((await withKey(`/api/datasets/${id}`, await pipelineKey(['vision:write']), 'DELETE')).status).toBe(403);
  });
});

describe('who owns a dataset', () => {
  const identities = new Map([
    [OWNER, { id: OWNER, handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' }],
    [MEMBER, { id: MEMBER }],
    // A group with a public page.
    [GROUP, { id: GROUP, handle: 'team-page', name: 'Team page' }]
  ]);
  const owners = async (path: string, user?: string) =>
    Object.fromEntries(
      ((await call(path, { user })).body.data.datasets as { name: string; owner: unknown }[]).map((row) => [
        row.name,
        row.owner
      ])
    );

  beforeEach(() => {
    jest.mocked(lookupOwnerIdentities).mockReset();
    jest
      .mocked(lookupOwnerIdentities)
      .mockImplementation(
        async (owners) => new Map([...identities].filter(([id]) => owners.some((owner) => owner.id === id)))
      );
  });

  it('names each person who owns a listed dataset, asking once for the list, and shows a hidden profile as an id', async () => {
    await createDataset({ name: 'Ann set', visibility: 'public' }, OWNER);
    await createDataset({ name: 'Quiet set', visibility: 'public' }, MEMBER);
    // Creating answers with the dataset too, which asks for its own owner.
    jest.mocked(lookupOwnerIdentities).mockClear();

    const listed = await owners('/api/datasets');

    expect(listed['Ann set']).toEqual({
      kind: 'user',
      id: OWNER,
      handle: 'ann-lee',
      name: 'Ann Lee',
      picture: 'https://p.test/ann.jpg'
    });
    expect(listed['Quiet set']).toEqual({ kind: 'user', id: MEMBER });
    expect(lookupOwnerIdentities).toHaveBeenCalledTimes(1);
  });

  it('names a group with a public page to anyone, and to its members by the name they know it by', async () => {
    await createDataset(
      { name: 'Team public', owner: { kind: 'group', id: GROUP }, visibility: 'public' },
      GROUP_OWNER
    );
    const page = { kind: 'group', id: GROUP, handle: 'team-page', name: 'Team page' };

    expect((await owners('/api/datasets'))['Team public']).toEqual(page);
    expect((await owners('/api/datasets', STRANGER))['Team public']).toEqual(page);
    expect((await owners('/api/datasets', MEMBER))['Team public']).toEqual({ ...page, name: 'Team' });
  });

  it('keeps a private group dataset to its members, named as they know the group', async () => {
    await groupDataset('Team set', MEMBER);

    expect((await owners(`/api/datasets?owner=${GROUP}`, MEMBER))['Team set']).toEqual({
      kind: 'group',
      id: GROUP,
      handle: 'team-page',
      name: 'Team'
    });
    expect((await owners(`/api/datasets?owner=${GROUP}`, STRANGER))['Team set']).toBeUndefined();
  });

  it('names the owner of a single dataset, and lists it without them when auth-service is silent', async () => {
    const id = await createDataset({ name: 'Ann set', visibility: 'public' }, OWNER);

    expect((await call(`/api/datasets/${id}`)).body.data.owner).toMatchObject({ handle: 'ann-lee', name: 'Ann Lee' });

    jest.mocked(lookupOwnerIdentities).mockResolvedValue(new Map());
    expect((await owners('/api/datasets'))['Ann set']).toEqual({ kind: 'user', id: OWNER });
  });

  it("lists one person's datasets for a profile, only those a visitor may read", async () => {
    await createDataset({ name: 'Ann public', visibility: 'public' }, OWNER);
    await createDataset({ name: 'Ann private' }, OWNER);
    await createDataset({ name: 'Other public', visibility: 'public' }, MEMBER);

    expect(Object.keys(await owners(`/api/datasets?user=${OWNER}`))).toEqual(['Ann public']);
    expect(Object.keys(await owners(`/api/datasets?user=${OWNER}`, OWNER)).sort()).toEqual([
      'Ann private',
      'Ann public'
    ]);
    expect(Object.keys(await owners(`/api/datasets?user=${MEMBER}`))).toEqual(['Other public']);
    expect((await call('/api/datasets?user=ann-lee')).status).toBe(400);
  });
});
