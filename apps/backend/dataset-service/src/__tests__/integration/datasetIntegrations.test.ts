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

import { enqueueDelete, removeQueuedImport } from '../../queue/importQueue';
import { runDelete } from '../../services/deleteService';
import { recoverDatasetJobs } from '../../services/jobRecoveryService';
import { fetchDatasetInfo } from '../../clients/hubClient';
import { clearHubCache } from '../../services/hubService';
import { Dataset } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import { fileStore } from '../fixtures/fileStore';
import { ADMIN, GROUP, MEMBER, OWNER, STRANGER, call, createDataset, groupDataset, uploadZip, useDatasetApi } from '../fixtures/datasetApi';

useDatasetApi();

describe('what label-service asks', () => {
  it('tells group-service what a group still owns, trashed datasets included', async () => {
    const team = await groupDataset();
    await call(`/api/datasets/${team}`, { method: 'DELETE', user: ADMIN });
    await createDataset({ name: 'Mine' });
    expect((await call(`/internal/groups/${GROUP}/owned`, { internal: true })).body.data).toEqual({
      count: 1,
      names: ['Team set']
    });
    expect((await call(`/internal/groups/${GROUP}/owned`)).status).toBe(401);
  });

  it('answers what one account may do with a dataset, and which datasets it may do something with', async () => {
    const team = await groupDataset();
    const open = await createDataset();
    const permission = async (id: string, userId?: string) =>
      (await call(`/internal/datasets/${id}/permission${userId ? `?userId=${userId}` : ''}`, { internal: true })).body
        .data.permission;
    expect(await permission(team, ADMIN)).toBe('manage');
    expect(await permission(team, STRANGER)).toBe('none');
    expect(await permission(open)).toBe('read');

    const ids = async (query: string) =>
      (await call(`/internal/datasets/ids?${query}`, { internal: true })).body.data.sort();
    expect(await ids(`userId=${ADMIN}&min=manage`)).toEqual([team]);
    expect(await ids(`userId=${MEMBER}&min=contribute`)).toEqual([team]);
    expect(await ids(`userId=${MEMBER}`)).toEqual([open, team].sort());
    expect(
      (await call(`/internal/datasets?userId=${ADMIN}&min=manage`, { internal: true })).body.data.map(
        (row: { _id: string; owner: unknown }) => [row._id, row.owner]
      )
    ).toEqual([[team, { kind: 'group', id: GROUP }]]);
    expect((await call(`/internal/datasets/ids?min=owner`, { internal: true })).status).toBe(400);
  });
});

describe('holds', () => {
  it.each([
    { 'import.status': 'queued' }, { 'import.status': 'running' }, { removingGroups: ['frames'] }
  ])('refuses a new claim during image mutation: %j', async (state) => {
    const id = await createDataset();
    await Dataset.updateOne({ _id: id }, { $set: state });
    expect((await call(`/internal/datasets/${id}/holds/label-service/job`, { method: 'PUT', internal: true })).status).toBe(409);
    expect((await Dataset.findById(id))!.holds).toHaveLength(0);
  });

  it('never acknowledges a hold when purge wins before the atomic update', async () => {
    const id = await createDataset();
    const update = Dataset.updateOne.bind(Dataset);
    const spy = jest.spyOn(Dataset, 'updateOne').mockImplementationOnce(((...args: Parameters<typeof Dataset.updateOne>) =>
      update({ _id: id }, { $set: { deletingAt: new Date() } }).then(() => update(...args))
    ) as unknown as typeof Dataset.updateOne);
    try {
      expect((await call(`/internal/datasets/${id}/holds/label-service/job`, { method: 'PUT', internal: true })).status).toBe(404);
      expect((await Dataset.findById(id))!.holds).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('recognizes an identical hold after a lost ACK and trashing, without duplicating it', async () => {
    const id = await createDataset();
    const path = `/internal/datasets/${id}/holds/label-service/job`;
    expect((await call(path, { method: 'PUT', internal: true })).status).toBe(204);
    await Dataset.updateOne({ _id: id }, { $set: { trashedAt: new Date() } });
    expect((await call(path, { method: 'PUT', internal: true })).status).toBe(204);
    expect((await Dataset.findById(id))!.holds).toHaveLength(1);
    expect((await call(`/internal/datasets/${id}/holds/label-service/other`, { method: 'PUT', internal: true })).status).toBe(404);
    expect((await call('/internal/datasets/invalid/holds/label-service/job', { method: 'PUT', internal: true })).status).toBe(404);
  });

  it('keeps a dataset labeling uses from being deleted for good, though it can go in the trash', async () => {
    const id = await createDataset();
    const { fileId } = await uploadZip(id, [{ path: 'frames/1.png', data: Buffer.from('x') }]);
    expect((await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT' })).status).toBe(401);
    expect(
      (await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status
    ).toBe(204);
    expect(
      (await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'PUT', internal: true })).status
    ).toBe(204);
    expect((await call(`/api/datasets/${id}`)).body.data.usedBy).toBe(1);

    expect(
      (
        await call(`/api/datasets/${id}/import`, {
          method: 'POST',
          user: OWNER,
          body: { groups: [{ folder: '', group: 'all' }] }
        })
      ).status
    ).toBe(409);
    expect(
      (
        await call(`/api/datasets/${id}/archive/upload-url`, {
          method: 'POST',
          user: OWNER,
          body: { filename: 'b.zip' }
        })
      ).status
    ).toBe(409);
    expect((await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER })).status).toBe(200);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(409);

    // A job deleted while its dataset is in the trash still lets go of it.
    expect(
      (await call(`/internal/datasets/${id}/holds/label-service/job1`, { method: 'DELETE', internal: true })).status
    ).toBe(204);
    expect(
      (await call(`/internal/datasets/not-an-id/holds/label-service/job1`, { method: 'DELETE', internal: true })).status
    ).toBe(404);
    await DatasetItem.create({ datasetId: id, group: 'g', path: 'p.png', stem: 'p', kind: 'image', size: 1 });
    await Dataset.updateOne({ _id: id }, { $set: { 'import.id': 'i', 'import.status': 'queued' } });
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(202);
    expect(removeQueuedImport).toHaveBeenCalledWith('i');
    expect(enqueueDelete).toHaveBeenCalledWith({ datasetId: id });

    // Gone for every reader, and no longer claimable; the files wait for the worker.
    expect((await call(`/api/datasets/${id}`)).status).toBe(404);
    expect((await call('/api/datasets/trash', { user: OWNER })).body.data).toEqual([]);
    expect(
      (await call(`/internal/datasets/${id}/holds/label-service/job2`, { method: 'PUT', internal: true })).status
    ).toBe(404);
    expect((await Dataset.findById(id).lean())?.import?.status).toBe('cancelled');
    expect(fileStore.stored.has(fileId)).toBe(true);
    expect((await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER })).status).toBe(404);
    expect(await recoverDatasetJobs()).toBe(1);
    await runDelete(id);
    expect(fileStore.stored.has(fileId)).toBe(false);
    expect(await DatasetItem.countDocuments({ datasetId: id })).toBe(0);
    expect(await Dataset.countDocuments({ _id: id })).toBe(0);
    await runDelete(id);
  });

  it('refuses a permanent delete that loses the race to a new hold', async () => {
    const id = await createDataset();
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER });
    const findOne = Dataset.findOne.bind(Dataset);
    // The hold lands between reading the dataset and marking it.
    const spy = jest.spyOn(Dataset, 'findOne').mockImplementationOnce(((
      ...args: Parameters<typeof Dataset.findOne>
    ) => {
      const read = findOne(...args).exec();
      return read.then(async (dataset) => {
        await Dataset.updateOne(
          { _id: id },
          { $push: { holds: { service: 'label-service', ref: 'late', createdAt: new Date() } } }
        );
        return dataset;
      });
    }) as unknown as typeof Dataset.findOne);
    const response = await call(`/api/datasets/${id}/permanent`, { method: 'DELETE', user: OWNER });
    spy.mockRestore();
    expect(response.status).toBe(409);
    expect((await Dataset.findById(id).lean())?.deletingAt).toBeUndefined();
  });
});

describe('resolving the dataset actually used by a training', () => {
  const resolve = (reference: string, userId = OWNER, projectOwner?: { kind: 'user' | 'group'; id: string }) =>
    call('/internal/datasets/resolve', { internal: true, method: 'POST', body: { reference, userId, projectOwner } });

  it('pins the id and archive version, and treats name characters literally', async () => {
    const id = await createDataset({ name: 'ZOD.v1' });
    const version = new Date('2026-10-01T12:00:00.000Z');
    await Dataset.updateOne(
      { _id: id },
      { $set: { archive: { fileId: 'archive', filename: 'set.zip', size: 42, uploadedAt: version } } }
    );
    expect((await resolve('zod.v1')).body.data).toEqual({
      source: 'visin',
      id,
      name: 'ZOD.v1',
      revision: version.toISOString()
    });
    expect((await resolve(id)).status).toBe(200);
    expect((await resolve('ZOD.*')).status).toBe(404);
    expect((await resolve(id, STRANGER)).status).toBe(404);
    const bare = await createDataset({ name: 'No archive' });
    expect((await resolve(bare)).body.data).toEqual({ source: 'visin', id: bare, name: 'No archive' });
  });

  it('requires an id for ambiguous names and rejects trash and unrelated ownership', async () => {
    await createDataset({ name: 'ZOD', visibility: 'public' });
    const id = await createDataset({ name: 'zod' });
    expect((await resolve('ZOD')).status).toBe(400);
    expect((await resolve(id, OWNER, { kind: 'group', id: GROUP })).status).toBe(404);
    expect((await resolve(id, STRANGER, { kind: 'user', id: OWNER })).status).toBe(200);
    await call(`/api/datasets/${id}`, { method: 'DELETE', user: OWNER });
    expect((await resolve(id)).status).toBe(404);
    expect(
      (await call('/internal/datasets/resolve', { method: 'POST', body: { reference: id, userId: OWNER } })).status
    ).toBe(401);
    expect((await call('/internal/datasets/resolve', { method: 'POST', internal: true, body: {} })).status).toBe(400);
  });
});

describe('datasets kept on the Hugging Face Hub', () => {
  const COMMIT = '3f2a1c9d8e7b6a5f4e3d2c1b0a99887766554433';
  const source = { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT };
  const resolve = (reference: string) =>
    call('/internal/datasets/resolve', { internal: true, method: 'POST', body: { reference, userId: OWNER } });

  it('is created on the Hub alone and downloads by pointer, with no zip', async () => {
    const id = await createDataset({
      name: 'Hub set',
      visibility: 'public',
      source: { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT.toUpperCase() }
    });
    expect((await call(`/api/datasets/${id}`)).body.data.source).toEqual(source);
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).toEqual({ source, revision: COMMIT });
    expect(download).not.toHaveProperty('downloadUrl');
    const resolved = (await resolve(id)).body.data;
    expect(resolved).toMatchObject({ id, revision: COMMIT });
    expect(resolved).not.toHaveProperty('archiveRevision');
  });

  it('keeps the zip as the local fallback and reports both revisions', async () => {
    const id = await createDataset();
    const { completed } = await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    expect(
      (await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source } })).body.data.source
    ).toEqual(source);
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).toMatchObject({
      source,
      revision: COMMIT,
      archiveRevision: completed.body.data.archive.uploadedAt
    });
    expect(download.downloadUrl).toMatch(/^signed:/);
    // A run that resolves it records both, so a zip replaced under an unchanged commit still shows.
    expect((await resolve(id)).body.data).toMatchObject({
      id,
      revision: COMMIT,
      archiveRevision: completed.body.data.archive.uploadedAt
    });
  });

  it('goes back to the local zip when the source is cleared, and needs manage to change', async () => {
    const id = await createDataset();
    await uploadZip(id, [{ path: 'a.png', data: Buffer.from('y') }]);
    await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source } });
    expect(
      (await call(`/api/datasets/${id}`, { method: 'PATCH', user: STRANGER, body: { source: null } })).status
    ).toBe(403);
    const cleared = await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source: null } });
    expect(cleared.body.data).not.toHaveProperty('source');
    const download = (await call(`/api/datasets/${id}/download`)).body.data;
    expect(download).not.toHaveProperty('source');
    expect(download.revision).toBe(download.archiveRevision);
  });

  it('refuses anything but a repo id pinned to a commit', async () => {
    const id = await createDataset();
    for (const bad of [
      { provider: 'hf', repo: 'acme/zod-png', revision: 'main' },
      { provider: 'hf', repo: 'acme/zod-png', revision: COMMIT.slice(0, 7) },
      { provider: 'hf', repo: 'zod-png', revision: COMMIT },
      { repo: 'acme/zod-png', revision: COMMIT },
      { repo: 'acme/zod-png', revision: COMMIT, provider: 's3' }
    ])
      expect((await call(`/api/datasets/${id}`, { method: 'PATCH', user: OWNER, body: { source: bad } })).status).toBe(
        400
      );
    expect(
      (
        await call('/api/datasets', {
          method: 'POST',
          user: OWNER,
          body: { name: 'Bad', source: { provider: 'hf', repo: 'x', revision: 'main' } }
        })
      ).status
    ).toBe(400);
  });

  it('shows what the Hub says about the repo to anyone who may read the dataset, and nothing for a private one', async () => {
    clearHubCache();
    jest
      .mocked(fetchDatasetInfo)
      .mockResolvedValue({ cardData: { license: 'mit' }, siblings: [{ rfilename: 'train/a.png', size: 7 }] });
    const id = await createDataset({ name: 'Hub set', visibility: 'public', source });
    const info = (await call(`/api/datasets/${id}/hub`)).body.data;
    expect(info).toMatchObject({
      repo: 'acme/zod-png',
      revision: COMMIT,
      license: 'mit',
      fileCount: 1,
      totalBytes: 7,
      folders: [{ path: 'train', files: 1, bytes: 7 }]
    });
    expect(fetchDatasetInfo).toHaveBeenCalledWith('acme/zod-png', COMMIT);
    const privateId = await createDataset({ name: 'Mine', source }, OWNER);
    expect((await call(`/api/datasets/${privateId}/hub`, { user: STRANGER })).status).toBe(403);
    expect((await call(`/api/datasets/${privateId}/hub`, { user: OWNER })).status).toBe(200);
  });

  it('has nothing to show for a dataset that is only a zip', async () => {
    const id = await createDataset();
    expect((await call(`/api/datasets/${id}/hub`)).status).toBe(400);
    expect(fetchDatasetInfo).not.toHaveBeenCalled();
  });
});
