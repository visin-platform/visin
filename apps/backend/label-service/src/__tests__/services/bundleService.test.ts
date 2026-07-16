jest.mock('../../models/LabelBundle', () => ({
  LabelBundle: { create: jest.fn(), find: jest.fn(), findById: jest.fn(), deleteOne: jest.fn() },
}));
jest.mock('../../models/ImportJob', () => ({
  ImportJob: { create: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() },
}));
jest.mock('../../models/LabelImage', () => ({
  LabelImage: { deleteMany: jest.fn() },
}));
jest.mock('../../models/LabelJob', () => ({
  LabelJob: { countDocuments: jest.fn() },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getUploadUrl: jest.fn(),
  fileExists: jest.fn(),
  deleteFolder: jest.fn(),
}));
jest.mock('../../clients/groupServiceClient', () => ({
  getMyGroups: jest.fn(),
}));
jest.mock('../../services/ingestService', () => ({
  bundleFileId: jest.requireActual('../../services/ingestService').bundleFileId,
  runImport: jest.fn(),
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
import * as files from '../../clients/fileServiceClient';
import * as groups from '../../clients/groupServiceClient';
import { runImport } from '../../services/ingestService';
import { BadRequestError, ConflictError, NotFoundError } from '@visin/backend-core';

const mockedBundle = LabelBundle as unknown as Record<string, jest.Mock>;
const mockedImport = ImportJob as unknown as Record<string, jest.Mock>;
const mockedImage = LabelImage as unknown as Record<string, jest.Mock>;
const mockedJob = LabelJob as unknown as Record<string, jest.Mock>;
const mockedFiles = files as unknown as Record<string, jest.Mock>;
const mockedGroups = groups as unknown as Record<string, jest.Mock>;
const mockedRunImport = runImport as jest.Mock;

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

describe('startImport', () => {
  const zipFileId = 'label-bundles/b1/upload-1.zip';

  it('creates a pending ImportJob and kicks the ingest', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue({ _id: { toString: () => 'i1' } });
    mockedRunImport.mockResolvedValue(undefined);

    const importJob = await svc.startImport('b1', zipFileId);

    expect(mockedImport.create).toHaveBeenCalledWith({ bundleId: 'b1', zipFileId, status: 'pending' });
    expect(mockedRunImport).toHaveBeenCalledWith('i1');
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
    mockedRunImport.mockResolvedValue(undefined);

    await svc.startImport('b1', zipFileId);

    expect(dead.status).toBe('failed');
    expect(dead.fileErrors[0].reason).toContain('stale');
    expect(dead.save).toHaveBeenCalled();
    expect(mockedImport.create).toHaveBeenCalled();
  });

  it('rejects when the zip has not been uploaded', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(false);

    await expect(svc.startImport('b1', zipFileId)).rejects.toThrow('upload it first');
  });

  it('logs but does not throw when the fired ingest crashes', async () => {
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.fileExists.mockResolvedValue(true);
    mockedImport.create.mockResolvedValue({ _id: { toString: () => 'i1' } });
    mockedRunImport.mockRejectedValue(new Error('boom'));

    await expect(svc.startImport('b1', zipFileId)).resolves.toBeDefined();
    await new Promise((resolve) => setImmediate(resolve)); // let the rejection settle
  });
});

describe('deleteImport', () => {
  it('removes finished imports', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport({ status: 'done' }));

    await svc.deleteImport('b1', 'i1');

    expect(mockedImport.deleteOne).toHaveBeenCalledWith({ _id: 'i1' });
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
    expect(mockedImport.deleteOne).not.toHaveBeenCalled();
  });
});

describe('deleteBundle', () => {
  beforeEach(() => {
    mockedJob.countDocuments.mockResolvedValue(0);
    mockedImport.findOne.mockResolvedValue(null);
    mockedFiles.deleteFolder.mockResolvedValue(undefined);
    mockedImage.deleteMany.mockResolvedValue({});
    mockedImport.deleteMany.mockResolvedValue({});
    mockedBundle.deleteOne.mockResolvedValue({});
  });

  it('deletes files, image rows, import history, and the bundle', async () => {
    await svc.deleteBundle('b1');

    expect(mockedJob.countDocuments).toHaveBeenCalledWith({ bundleId: 'b1', status: { $ne: 'archived' } });
    expect(mockedFiles.deleteFolder).toHaveBeenCalledWith('label-bundles/b1/');
    expect(mockedImage.deleteMany).toHaveBeenCalledWith({ bundleId: 'b1' });
    expect(mockedImport.deleteMany).toHaveBeenCalledWith({ bundleId: 'b1' });
    expect(mockedBundle.deleteOne).toHaveBeenCalledWith({ _id: 'b1' });
  });

  it('refuses while non-archived jobs reference the bundle', async () => {
    mockedJob.countDocuments.mockResolvedValue(2);

    await expect(svc.deleteBundle('b1')).rejects.toThrow('2 non-archived job(s)');
    expect(mockedFiles.deleteFolder).not.toHaveBeenCalled();
  });

  it('refuses while an import is live, allows when stale', async () => {
    mockedImport.findOne.mockResolvedValue(liveImport());
    await expect(svc.deleteBundle('b1')).rejects.toThrow(ConflictError);

    mockedImport.findOne.mockResolvedValue(staleImport());
    await expect(svc.deleteBundle('b1')).resolves.toBeUndefined();
  });
});

describe('getImport', () => {
  it('scopes the lookup to the bundle', async () => {
    mockedImport.findOne.mockResolvedValue(null);

    await expect(svc.getImport('b1', 'i1')).rejects.toThrow(NotFoundError);
    expect(mockedImport.findOne).toHaveBeenCalledWith({ _id: 'i1', bundleId: 'b1' });
  });
});
