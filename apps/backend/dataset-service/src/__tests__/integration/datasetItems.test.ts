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

import mongoose from 'mongoose';
import { enqueueRemoveGroup } from '../../queue/importQueue';
import { runRemoveGroup } from '../../services/deleteService';
import { recoverDatasetJobs } from '../../services/jobRecoveryService';
import { Dataset } from '../../models/Dataset';
import { DatasetItem } from '../../models/DatasetItem';
import { fileStore } from '../fixtures/fileStore';
import { OWNER, STRANGER, call, createDataset, useDatasetApi } from '../fixtures/datasetApi';

useDatasetApi();

describe('items', () => {
  let id: string;
  beforeEach(async () => {
    id = await createDataset();
    const datasetId = new mongoose.Types.ObjectId(id);
    await DatasetItem.create([
      {
        datasetId,
        group: 'frames',
        path: 'frames/0001.jpg',
        stem: '0001',
        kind: 'image',
        size: 1,
        fileId: 'f1',
        thumbnailFileId: 't1'
      },
      {
        datasetId,
        group: 'frames',
        path: 'frames/0002.jpg',
        stem: '0002',
        kind: 'image',
        size: 1,
        fileId: 'f2',
        thumbnailFileId: 't2'
      },
      {
        datasetId,
        group: 'verify',
        path: 'verify/0001.ids.png',
        stem: '0001',
        variant: 'ids',
        kind: 'image',
        size: 1,
        fileId: 'i1'
      },
      {
        datasetId,
        group: 'verify',
        path: 'verify/0001.masks.json',
        stem: '0001',
        variant: 'masks',
        kind: 'json',
        size: 1,
        data: [
          { id: 1, class: 'car', quality: 'good' },
          { id: 2, class: 'car', quality: 'bad' }
        ]
      },
      {
        datasetId,
        group: 'verify',
        path: 'verify/0002.masks.json',
        stem: '0002',
        variant: 'masks',
        kind: 'json',
        size: 1,
        data: [{ id: 1, class: 'bus', score: { nested: 1 } }]
      }
    ]);
    await Dataset.updateOne({ _id: id }, { $set: { manifest: [{ stem: '0001', attributes: { stratum: 'day' } }] } });
  });

  it('removes one image group in the background, hiding it at once', async () => {
    const datasetId = new mongoose.Types.ObjectId(id);
    for (const item of await DatasetItem.find({ datasetId })) {
      fileStore.stored.set(item.fileId!, Buffer.from('x'));
      if (item.thumbnailFileId) fileStore.stored.set(item.thumbnailFileId, Buffer.from('t'));
    }
    await Dataset.updateOne(
      { _id: id },
      {
        $set: {
          groups: [
            { name: 'frames', images: 2, jsons: 0 },
            { name: 'verify', images: 1, jsons: 2 }
          ],
          imageCount: 3,
          coverPath: 'frames/0002.jpg',
          import: {
            id: 'i',
            status: 'done',
            mapping: {
              groups: [
                { folder: 'frames', group: 'frames' },
                { folder: 'verify', group: 'verify' }
              ]
            },
            processed: 5,
            skipped: 0,
            errors: []
          }
        }
      }
    );
    const remove = (group: string, user = OWNER) =>
      call(`/api/datasets/${id}/groups/${group}`, { method: 'DELETE', user });

    expect((await remove('frames', STRANGER)).status).toBe(403);
    expect((await remove('lidar')).status).toBe(404);
    const removed = await remove('frames');
    expect(removed.status).toBe(202);
    expect(enqueueRemoveGroup).toHaveBeenCalledWith({ datasetId: id, group: 'frames' });
    expect(removed.body.data).toMatchObject({
      groups: [{ name: 'verify' }],
      imageCount: 1,
      removingGroups: ['frames']
    });
    expect((await remove('frames')).status).toBe(409);

    // Gone for readers and for labeling straight away; the files wait for the worker.
    expect(
      (await call(`/api/datasets/${id}/items?kind=image`)).body.data.items.map((item: { path: string }) => item.path)
    ).toEqual(['verify/0001.ids.png']);
    expect((await call(`/api/datasets/${id}/items?group=frames`)).body.data.items).toEqual([]);
    expect((await call(`/internal/datasets/${id}/items?group=frames`, { internal: true })).body.data.items).toEqual([]);
    expect((await call(`/internal/datasets/${id}/items`, { internal: true })).body.data.items).toHaveLength(3);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).body.data.groups).toEqual([
      { name: 'verify', images: 1, jsons: 2 }
    ]);
    expect(fileStore.stored.has('f1')).toBe(true);
    await Dataset.updateOne(
      { _id: id },
      { $set: { archive: { fileId: 'z.zip', filename: 'z.zip', uploadedAt: new Date() } } }
    );
    expect(
      (
        await call(`/api/datasets/${id}/import`, {
          method: 'POST',
          user: OWNER,
          body: { groups: [{ folder: 'frames', group: 'frames' }] }
        })
      ).status
    ).toBe(409);

    expect(await recoverDatasetJobs()).toBe(1);
    await runRemoveGroup(id, 'frames');
    for (const fileId of ['f1', 't1', 'f2', 't2']) expect(fileStore.stored.has(fileId)).toBe(false);
    expect(fileStore.stored.has('i1')).toBe(true);
    const after = await Dataset.findById(id).lean();
    expect(after).toMatchObject({ imageCount: 1, removingGroups: [] });
    // The pick went with its group, and an id map is never an automatic cover.
    expect(after?.coverPath).toBeUndefined();
    expect(after?.coverFileId).toBeUndefined();
    expect(after?.import?.mapping.groups).toEqual([{ folder: 'verify', group: 'verify' }]);
    expect(await DatasetItem.countDocuments({ datasetId, group: 'frames' })).toBe(0);
    await runRemoveGroup(id, 'frames');
  });

  it('refuses to remove a group while labeling holds the dataset or an import runs', async () => {
    await Dataset.updateOne({ _id: id }, { $set: { groups: [{ name: 'frames', images: 2, jsons: 0 }] } });
    await Dataset.updateOne({ _id: id }, { $set: { 'import.id': 'i', 'import.status': 'queued' } });
    expect((await call(`/api/datasets/${id}/groups/frames`, { method: 'DELETE', user: OWNER })).status).toBe(409);
    await Dataset.updateOne(
      { _id: id },
      { $unset: { import: '' }, $push: { holds: { service: 'label-service', ref: 'job', createdAt: new Date() } } }
    );
    expect((await call(`/api/datasets/${id}/groups/frames`, { method: 'DELETE', user: OWNER })).status).toBe(409);
  });

  it('lets a writer pick the cover image, and go back to the automatic one', async () => {
    const [frame] = (await call(`/api/datasets/${id}/items?group=frames&limit=1`)).body.data.items;
    const cover = (itemId: string | null, user = OWNER) =>
      call(`/api/datasets/${id}/cover`, { method: 'PUT', user, body: { itemId } });

    expect((await cover(frame._id, STRANGER)).status).toBe(403);
    expect((await cover('0123456789abcdef01234567')).status).toBe(404);
    expect((await cover('not-an-id')).status).toBe(400);
    const json = await DatasetItem.findOne({ datasetId: id, kind: 'json' });
    expect((await cover(json!._id.toString())).status).toBe(404);

    const second = await DatasetItem.findOne({ datasetId: id, path: 'frames/0002.jpg' });
    const picked = await cover(second!._id.toString());
    expect(picked.body.data).toMatchObject({ coverPath: 'frames/0002.jpg', coverUrl: 'signed:t2' });
    expect((await call('/api/datasets')).body.data.datasets[0].coverUrl).toBe('signed:t2');

    const automatic = await cover(null);
    expect(automatic.body.data.coverPath).toBeUndefined();
    expect(automatic.body.data.coverUrl).toBe('signed:t1');
  });

  it('pages thumbnails, filters, and includes JSON only for one stem', async () => {
    const frames = await call(`/api/datasets/${id}/items?group=frames&limit=1`);
    expect(frames.body.data.items).toEqual([
      expect.objectContaining({ path: 'frames/0001.jpg', thumbnailUrl: 'signed:t1' })
    ]);
    expect(frames.body.data.items[0]).not.toHaveProperty('url');
    expect(frames.body.data.pagination).toMatchObject({ total: 2, pages: 2 });

    const stem = await call(`/api/datasets/${id}/items?stem=0001`);
    expect(stem.body.data.items.map((item: { path: string }) => item.path)).toEqual([
      'frames/0001.jpg',
      'verify/0001.ids.png',
      'verify/0001.masks.json'
    ]);
    expect(stem.body.data.items[0].url).toBe('signed:f1');
    expect(stem.body.data.items[1].thumbnailUrl).toBe('signed:i1');
    expect(stem.body.data.items[2].data).toHaveLength(2);

    expect((await call(`/api/datasets/${id}/items?search=0002&kind=image`)).body.data.items).toHaveLength(1);
    const listed = (await call(`/api/datasets/${id}/items?kind=json`)).body.data.items;
    expect(listed[0].data).toBeUndefined();

    const one = await call(`/api/datasets/${id}/items/${stem.body.data.items[2]._id}`);
    expect(one.body.data.data).toHaveLength(2);
    expect((await call(`/api/datasets/${id}/items/nope`)).status).toBe(404);
  });

  it('serves label-service: summaries, keyset pages, JSON field tallies and the manifest', async () => {
    expect((await call('/internal/datasets')).status).toBe(401);
    const listed = await call(`/internal/datasets?userId=${STRANGER}`, { internal: true });
    expect(listed.body.data.map((row: { _id: string }) => row._id)).toEqual([id]);
    expect((await call(`/internal/datasets/${id}`, { internal: true })).body.data).toMatchObject({
      name: 'Public set',
      holds: []
    });

    const firstPage = await call(`/internal/datasets/${id}/items?limit=2`, { internal: true });
    expect(firstPage.body.data.items.map((item: { path: string }) => item.path)).toEqual([
      'frames/0001.jpg',
      'frames/0002.jpg'
    ]);
    expect(firstPage.body.data.items[0].fileId).toBe('f1');
    const nextPage = await call(
      `/internal/datasets/${id}/items?limit=2&after=${encodeURIComponent(firstPage.body.data.next)}`,
      { internal: true }
    );
    expect(nextPage.body.data.items.map((item: { path: string }) => item.path)).toEqual([
      'verify/0001.ids.png',
      'verify/0001.masks.json'
    ]);

    const frames = await call(`/internal/datasets/${id}/items?group=frames&kind=image&noVariant=true`, {
      internal: true
    });
    expect(frames.body.data).toMatchObject({ next: null });
    expect(frames.body.data.items).toHaveLength(2);
    const masks = await call(`/internal/datasets/${id}/items?group=verify&variant=masks`, { internal: true });
    expect(masks.body.data.items[0].data).toHaveLength(2);

    const fields = await call(`/internal/datasets/${id}/json-fields?group=verify&variant=masks`, { internal: true });
    expect(fields.body.data).toEqual([
      {
        field: 'class',
        values: [
          { value: 'car', count: 2 },
          { value: 'bus', count: 1 }
        ]
      },
      {
        field: 'quality',
        values: [
          { value: 'good', count: 1 },
          { value: 'bad', count: 1 }
        ]
      }
    ]);
    expect((await call(`/internal/datasets/${id}/manifest`, { internal: true })).body.data).toEqual([
      { stem: '0001', attributes: { stratum: 'day' } }
    ]);
  });

  it('drops a field with too many distinct values from the tally', async () => {
    await DatasetItem.create({
      datasetId: id,
      group: 'wide',
      path: 'wide/a.json',
      stem: 'a',
      kind: 'json',
      size: 1,
      data: Array.from({ length: 45 }, (_, index) => ({ id: index, score: index, kind: 'x' }))
    });
    const fields = await call(`/internal/datasets/${id}/json-fields?group=wide`, { internal: true });
    expect(fields.body.data).toEqual([{ field: 'kind', values: [{ value: 'x', count: 45 }] }]);
  });
});

describe('cover pictures for another service', () => {
  const covers = (ids: string[], userId?: string) =>
    call('/internal/datasets/covers', { internal: true, method: 'POST', body: { ids, ...(userId ? { userId } : {}) } });
  const withCover = async (name: string, visibility?: 'public') => {
    const id = await createDataset({ name, ...(visibility ? { visibility } : {}) });
    await Dataset.updateOne({ _id: id }, { $set: { coverFileId: `cover-${name}` } });
    return id;
  };

  it('returns the covers a reader may see, and says nothing of the rest', async () => {
    const open = await withCover('open', 'public');
    const hidden = await withCover('hidden');
    const bare = await createDataset({ name: 'bare', visibility: 'public' });

    expect((await covers([open, hidden, bare])).body.data).toEqual({ [open]: 'signed:cover-open' });
    expect((await covers([open, hidden, bare], STRANGER)).body.data).toEqual({ [open]: 'signed:cover-open' });
    expect((await covers([open, hidden, bare], OWNER)).body.data).toEqual({
      [open]: 'signed:cover-open',
      [hidden]: 'signed:cover-hidden'
    });
  });

  it('has nothing for datasets with no cover, and for a cover whose address could not be made', async () => {
    const bare = await createDataset({ name: 'plain', visibility: 'public' });
    expect((await covers([bare])).body.data).toEqual({});

    const unsigned = await withCover('unsigned', 'public');
    const { getDownloadUrls } = jest.requireMock('../../clients/fileServiceClient') as { getDownloadUrls: jest.Mock };
    getDownloadUrls.mockResolvedValueOnce({ urls: {}, expiresMs: Date.now() + 60_000 });
    expect((await covers([unsigned])).body.data).toEqual({});
  });

  it('is for services only, and takes a list of ids', async () => {
    expect((await call('/internal/datasets/covers', { method: 'POST', body: { ids: [OWNER] } })).status).toBe(401);
    expect((await covers([])).status).toBe(400);
    expect((await covers(['not-an-id'])).status).toBe(400);
  });
});
