jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('../../models/ImportJob', () => ({
  ImportJob: { create: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { deleteMany: jest.fn(), find: jest.fn() },
}));
jest.mock('../../models/LabelJob', () => ({
  LabelJob: { countDocuments: jest.fn(), find: jest.fn(), deleteMany: jest.fn(), distinct: jest.fn(), exists: jest.fn() },
}));
jest.mock('../../models/LabelTask', () => ({
  LabelTask: { deleteMany: jest.fn() },
}));
jest.mock('../../models/LabelAnswer', () => ({
  LabelAnswer: { deleteMany: jest.fn() },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getUploadUrl: jest.fn(),
  fileExists: jest.fn(),
  deleteFolder: jest.fn(),
  listFiles: jest.fn(),
}));
jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(),
}));
jest.mock('../../services/previewService', () => ({
  previewZip: jest.fn(),
}));
jest.mock('../../services/ingestService', () => ({
  bundleFileId: jest.requireActual('../../services/ingestService').bundleFileId,
}));
jest.mock('../../queue/importQueue', () => ({
  enqueueImport: jest.fn(),
  removeQueuedImport: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import * as svc from '../../services/bundleService';
import { LabelBundle } from '../../models/LabelBundle';
import { ImportJob } from '../../models/ImportJob';
import { LabelImage } from '../../models/LabelImage';
import { LabelJob } from '../../models/LabelJob';
import { LabelTask } from '../../models/LabelTask';
import { LabelAnswer } from '../../models/LabelAnswer';
import * as files from '../../clients/fileServiceClient';
import * as groups from '../../clients/groupServiceClient';
import { enqueueImport, removeQueuedImport } from '../../queue/importQueue';
import { previewZip } from '../../services/previewService';
import { BadGatewayError, BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';

const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedImport = ImportJob as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedTask = LabelTask as unknown as Record<string, jest.Mock>;
const mockedAnswer = LabelAnswer as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;
const mockedGroups = groups as unknown as Record<string, jest.Mock>;
const mockedEnqueue = enqueueImport as jest.Mock;
const mockedRemoveQueued = removeQueuedImport as jest.Mock;
const mockedPreviewZip = previewZip as jest.Mock;

const user = { id: 'u1', email: 'Admin@X.com', name: 'Admin' };

const liveImport = (overrides: Record<string, unknown> = {}) => ({
  _id: 'i1',
  status: 'running',
  updatedAt: new Date(), // fresh heartbeat
  fileErrors: [] as { path: string; reason: string }[],
  save: jest.fn(),
  ...overrides,
});

const staleImport = (overrides: Record<string, unknown> = {}) =>
  liveImport({ updatedAt: new Date(Date.now() - 11 * 60 * 1000), ...overrides });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createBundle', () => {
  it('creates an empty bundle attributed to the user', async () => {
    mockedBundle.create.mockResolvedValue({ _id: 'b1' });

    await svc.createBundle(user, { name: 'Set', groupId: 'g1' });

    expect(mockedBundle.create).toHaveBeenCalledWith({
      name: 'Set',
      groupId: 'g1',
      createdBy: { userId: 'u1', email: 'admin@x.com', name: 'Admin' },
      status: 'empty',
    });
  });
});

describe('listBundlesForUser', () => {
  it('lists bundles across all my groups', async () => {
    mockedGroups.getMyGroups.mockResolvedValue([
      { groupId: 'g1', role: 'member' },
      { groupId: 'g2', role: 'owner' },
    ]);
    const sort = jest.fn().mockResolvedValue([]);
    mockedBundle.find.mockReturnValue({ sort });

    await svc.listBundlesForUser('user@x.com');

    expect(mockedBundle.find).toHaveBeenCalledWith({ groupId: { $in: ['g1', 'g2'] } });
  });
});

describe('public bundles', () => {
  const doc = (fields: Record<string, unknown>) => ({ toObject: () => fields });
  const uploader = { userId: 'u1', email: 'uploader@x.com' };

  it('lists the bundles behind active, publicly shared jobs, without their uploader', async () => {
    mockedJob.distinct.mockResolvedValue(['b1', 'b2']);
    const sort = jest.fn().mockResolvedValue([doc({ _id: 'b1', name: 'A', createdBy: uploader })]);
    mockedBundle.find.mockReturnValue({ sort });

    const result = await svc.listPublicBundles();

    expect(mockedJob.distinct).toHaveBeenCalledWith('bundleId', { status: 'active', isPublic: true });
    expect(mockedBundle.find).toHaveBeenCalledWith({ _id: { $in: ['b1', 'b2'] } });
    expect(sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(result).toEqual([{ _id: 'b1', name: 'A' }]);
  });

  it.each([
    [{ _id: 'j1' }, true],
    [null, false],
  ])('treats a bundle as public exactly while such a job exists (%p → %s)', async (found, expected) => {
    mockedJob.exists.mockResolvedValue(found);

    await expect(svc.isBundlePublic('b1')).resolves.toBe(expected);
    expect(mockedJob.exists).toHaveBeenCalledWith({ bundleId: 'b1', status: 'active', isPublic: true });
  });

  it('strips only the uploader identity', () => {
    const bundle = doc({ _id: 'b1', name: 'A', groupId: 'g1', createdBy: uploader });

    expect(svc.withoutCreatorIdentity(bundle as never)).toEqual({ _id: 'b1', name: 'A', groupId: 'g1' });
  });
});

describe('getBundle', () => {
  it('throws NotFound for a missing bundle', async () => {
    mockedBundle.findById.mockResolvedValue(null);

    await expect(svc.getBundle('missing')).rejects.toThrow(NotFoundError);
  });
});

describe('createUploadUrl', () => {
  it('signs a zip path under the bundle folder', async () => {
    mockedFiles.getUploadUrl.mockResolvedValue({ url: 'http://signed', expiresMs: 5 });

    const result = await svc.createUploadUrl('b1');

    expect(result.zipFileId).toMatch(/^label-bundles\/b1\/upload-\d+\.zip$/);
    expect(result.uploadUrl).toBe('http://signed');
  });
});

describe('updateBundle', () => {
  const doc = (overrides: Record<string, unknown> = {}) => ({
    _id: 'b1',
    name: 'Old',
    description: 'was here',
    save: jest.fn(),
    ...overrides,
  });

  it('renames and re-describes without touching content', async () => {
    const bundle = doc();
    mockedBundle.findById.mockResolvedValue(bundle);

    const updated = await svc.updateBundle('b1', { name: 'New', description: 'zod triage v2' });

    expect(updated.name).toBe('New');
    expect(updated.description).toBe('zod triage v2');
    expect(bundle.save).toHaveBeenCalled();
  });

  it('leaves an omitted field alone and clears an emptied description', async () => {
    const bundle = doc();
    mockedBundle.findById.mockResolvedValue(bundle);

    await svc.updateBundle('b1', { description: '' });

    expect(bundle.name).toBe('Old');
    expect(bundle.description).toBeUndefined();
  });

  it('404s on an unknown bundle', async () => {
    mockedBundle.findById.mockResolvedValue(null);

    await expect(svc.updateBundle('nope', { name: 'x' })).rejects.toThrow(NotFoundError);
  });
});

describe('listUploads', () => {
  it('lists this bundle\'s zips newest first, ignoring imported content', async () => {
    mockedFiles.listFiles.mockResolvedValue([
      { name: 'label-bundles/b1/upload-100.zip', size: 10, lastModified: '2026-08-01T00:00:00.000Z' },
      { name: 'label-bundles/b1/upload-300.zip', size: 30, lastModified: '2026-08-03T00:00:00.000Z' },
      { name: 'label-bundles/b1/frames/a.jpg', size: 1, lastModified: '2026-08-02T00:00:00.000Z' },
    ]);

    const uploads = await svc.listUploads('b1');

    expect(mockedFiles.listFiles).toHaveBeenCalledWith('label-bundles/b1/');
    expect(uploads).toEqual([
      { zipFileId: 'label-bundles/b1/upload-300.zip', size: 30, uploadedAt: '2026-08-03T00:00:00.000Z' },
      { zipFileId: 'label-bundles/b1/upload-100.zip', size: 10, uploadedAt: '2026-08-01T00:00:00.000Z' },
    ]);
  });

  it('is empty when nothing has been uploaded yet', async () => {
    mockedFiles.listFiles.mockResolvedValue([]);

    await expect(svc.listUploads('b1')).resolves.toEqual([]);
  });
});

describe('previewImport', () => {
  const zipFileId = 'label-bundles/b1/upload-1.zip';

  it('inspects an uploaded zip for the mapping step', async () => {
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedPreviewZip.mockResolvedValue({ folders: [] });

    await expect(svc.previewImport('b1', zipFileId)).resolves.toEqual({ folders: [] });
    expect(mockedPreviewZip).toHaveBeenCalledWith(zipFileId);
  });

  it('rejects a zip belonging to another bundle', async () => {
    await expect(svc.previewImport('b1', 'label-bundles/b2/upload-1.zip')).rejects.toThrow(BadRequestError);
    expect(mockedPreviewZip).not.toHaveBeenCalled();
  });

  it('rejects when the zip has not been uploaded', async () => {
    mockedFiles.fileExists.mockResolvedValue(false);

    await expect(svc.previewImport('b1', zipFileId)).rejects.toThrow('upload it first');
  });
});

describe('startImport', () => {
  const zipFileId = 'label-bundles/b1/upload-1.zip';

  it('stores the mapping on the import job when one is given', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue({ _id: { toString: () => 'i1' } });
    mockedEnqueue.mockResolvedValue(undefined);
    const mapping = { frames: 'img', annotations: [{ path: 'seg', set: 'sam' }] };

    await svc.startImport('b1', zipFileId, mapping);

    expect(mockedImport.create).toHaveBeenCalledWith({ bundleId: 'b1', zipFileId, status: 'pending', mapping });
  });

  it('creates a pending ImportJob and queues the ingest', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue({ _id: { toString: () => 'i1' } });
    mockedEnqueue.mockResolvedValue(undefined);

    const importJob = await svc.startImport('b1', zipFileId);

    expect(mockedImport.create).toHaveBeenCalledWith({ bundleId: 'b1', zipFileId, status: 'pending' });
    expect(mockedEnqueue).toHaveBeenCalledWith({ importJobId: 'i1', bundleId: 'b1' });
    expect(importJob).toBeDefined();
  });

  it('rejects a zipFileId outside this bundle', async () => {
    await expect(svc.startImport('b1', 'label-bundles/OTHER/upload-1.zip')).rejects.toThrow(BadRequestError);
    await expect(svc.startImport('b1', 'label-bundles/b1/../b2/x.zip')).rejects.toThrow(BadRequestError);
  });

  it('rejects a concurrent import with a live heartbeat', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport());

    await expect(svc.startImport('b1', zipFileId)).rejects.toThrow(ConflictError);
  });

  it('fails a stale import and lets the retry proceed', async () => {
    const dead = staleImport();
    mockedImport.findOne.mockResolvedValue(dead);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue({ _id: { toString: () => 'i2' } });
    mockedEnqueue.mockResolvedValue(undefined);

    await svc.startImport('b1', zipFileId);

    expect(dead.status).toBe('failed');
    expect(dead.fileErrors[0].reason).toContain('stale');
    expect(dead.save).toHaveBeenCalled();
    // A superseded import must not stay queued behind the retry.
    expect(mockedRemoveQueued).toHaveBeenCalledWith('i1');
    expect(mockedImport.create).toHaveBeenCalled();
  });

  it('rejects when the zip has not been uploaded', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(false);

    await expect(svc.startImport('b1', zipFileId)).rejects.toThrow('upload it first');
  });

  it('fails the ImportJob and reports 502 when the queue is unreachable', async () => {
    const created = {
      _id: { toString: () => 'i1' },
      status: 'pending',
      fileErrors: [] as { path: string; reason: string }[],
      finishedAt: undefined as Date | undefined,
      save: jest.fn()
    };
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue(created);
    mockedEnqueue.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(svc.startImport('b1', zipFileId)).rejects.toThrow(BadGatewayError);

    // Nothing will pick it up, so it must not be left polling as `pending`.
    expect(created.status).toBe('failed');
    expect(created.fileErrors[0].reason).toContain('ECONNREFUSED');
    expect(created.finishedAt).toBeInstanceOf(Date);
    expect(created.save).toHaveBeenCalled();
  });
});

describe('deleteImport', () => {
  it('removes finished imports', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport({ status: 'done' }));

    await svc.deleteImport('b1', 'i1');

    expect(mockedImport.deleteOne).toHaveBeenCalledWith({ _id: 'i1' });
    expect(mockedRemoveQueued).toHaveBeenCalledWith('i1');
  });

  it('refuses a live running import', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport());

    await expect(svc.deleteImport('b1', 'i1')).rejects.toThrow('still running');
  });

  it('marks a stale running import as failed (abandon)', async () => {
    const dead = staleImport();
    mockedImport.findOne.mockResolvedValue(dead);

    await svc.deleteImport('b1', 'i1');

    expect(dead.status).toBe('failed');
    expect(dead.save).toHaveBeenCalled();
    expect(mockedRemoveQueued).toHaveBeenCalledWith('i1');
    expect(mockedImport.deleteOne).not.toHaveBeenCalled();
  });
});

describe('deleteBundle', () => {
  beforeEach(() => {
    mockedJob.find.mockResolvedValue([]);
    mockedJob.deleteMany.mockResolvedValue({});
    mockedTask.deleteMany.mockResolvedValue({});
    mockedAnswer.deleteMany.mockResolvedValue({});
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.deleteFolder.mockResolvedValue(undefined);
    mockedImage.deleteMany.mockResolvedValue({});
    mockedImport.deleteMany.mockResolvedValue({});
    mockedBundle.deleteOne.mockResolvedValue({});
  });

  it('deletes files, image rows, import history, and the bundle', async () => {
    await svc.deleteBundle('b1');

    expect(mockedFiles.deleteFolder).toHaveBeenCalledWith('label-bundles/b1/');
    expect(mockedImage.deleteMany).toHaveBeenCalledWith({ bundleId: 'b1' });
    expect(mockedImport.deleteMany).toHaveBeenCalledWith({ bundleId: 'b1' });
    expect(mockedBundle.deleteOne).toHaveBeenCalledWith({ _id: 'b1' });
  });

  it('cascades through jobs to their tasks and answers, whatever their status', async () => {
    mockedJob.find.mockResolvedValue([{ _id: 'j1' }, { _id: 'j2' }]);

    await svc.deleteBundle('b1');

    // Every job, not just archived ones — the old gate refused here, which left
    // callers archiving instead and stranded the tasks.
    expect(mockedJob.find).toHaveBeenCalledWith({ bundleId: 'b1' }, { _id: 1 });
    expect(mockedAnswer.deleteMany).toHaveBeenCalledWith({ jobId: { $in: ['j1', 'j2'] } });
    expect(mockedTask.deleteMany).toHaveBeenCalledWith({ jobId: { $in: ['j1', 'j2'] } });
    expect(mockedJob.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['j1', 'j2'] } });
  });

  it('skips the job cascade when the bundle has no jobs', async () => {
    await svc.deleteBundle('b1');

    expect(mockedAnswer.deleteMany).not.toHaveBeenCalled();
    expect(mockedTask.deleteMany).not.toHaveBeenCalled();
    expect(mockedJob.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses while an import is live, allows when stale', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport());
    await expect(svc.deleteBundle('b1')).rejects.toThrow(ConflictError);

    mockedImport.findOne.mockResolvedValue(staleImport());
    await expect(svc.deleteBundle('b1')).resolves.toBeUndefined();
    // The abandoned import must not be re-run against a bundle that is gone.
    expect(mockedRemoveQueued).toHaveBeenCalledWith('i1');
  });
});

describe('getImport', () => {
  it('scopes the lookup to the bundle', async () => {
    mockedImport.findOne.mockResolvedValue(null);

    await expect(svc.getImport('b1', 'i1')).rejects.toThrow(NotFoundError);
    expect(mockedImport.findOne).toHaveBeenCalledWith({ _id: 'i1', bundleId: 'b1' });
  });
});

describe('maskFields', () => {
  const withMasks = (masks: Record<string, unknown>[]) => ({ metadata: { masks } });

  it('tallies groupable scalar fields per value, newest-largest first', async () => {
    mockedImage.find.mockResolvedValue([
      withMasks([
        { id: 1, class: 'sign', stratum: 'rare', bbox: [1, 2, 3, 4], score: null },
        { id: 2, class: 'sign', stratum: 'common' },
      ]),
      withMasks([{ id: 1, class: 'vehicle', stratum: 'common' }]),
    ]);

    const fields = await svc.maskFields('b1', 'setA');

    expect(mockedImage.find).toHaveBeenCalledWith(
      { bundleId: 'b1', kind: 'idmap', annotationSet: 'setA' },
      { 'metadata.masks': 1 }
    );
    expect(fields).toEqual([
      { field: 'class', values: [{ value: 'sign', count: 2 }, { value: 'vehicle', count: 1 }] },
      { field: 'stratum', values: [{ value: 'common', count: 2 }, { value: 'rare', count: 1 }] },
    ]);
  });

  it('drops the per-mask id, arrays, and anything too high-cardinality to group by', async () => {
    mockedImage.find.mockResolvedValue([
      withMasks(
        Array.from({ length: 60 }, (_, i) => ({ id: i, class: 'sign', pixel_count: 100 + i }))
      ),
    ]);

    const fields = await svc.maskFields('b1', 'setA');

    expect(fields.map((f) => f.field)).toEqual(['class']);
  });
});
