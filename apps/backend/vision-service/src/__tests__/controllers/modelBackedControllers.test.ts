import { vi, type Mock } from 'vitest';
vi.mock('../../services/uploadReservationService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/uploadReservationService')>(
      '../../services/uploadReservationService'
    )),
    reserveUpload: vi.fn(async function () {
      return { allocationId: 'reserved-id' };
    }),
    claimUpload: vi.fn(async function (
      _fileId: string,
      _kind: string,
      _parent: string,
      _resource: string,
      _user: string,
      resourceId?: string
    ) {
      const files = await import('../../clients/fileServiceClient');
      const metadata = files.getFileMetadata ? await files.getFileMetadata(_fileId) : undefined;
      return { resourceId: resourceId || 'reserved-id', size: metadata?.size ?? 10 };
    }),
    deleteReservedFile: vi.fn(async function (fileId: string) {
      return (await import('../../clients/fileServiceClient')).deleteFile(fileId);
    })
  }))();
  return Object.assign({ default: module }, module);
});
// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
vi.mock('../../services/writeAccessService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/writeAccessService')>('../../services/writeAccessService')),
    assertResourceWrite: vi.fn(async function (resource: unknown) {
      if (!resource)
        throw new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).ForbiddenError();
    }),
    assertEpochWrite: vi.fn(async function (uuid: string) {
      const epoch = await (await import('../../models/Epoch')).default.findOne({ epoch_uuid: uuid });
      if (!epoch)
        throw new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).ForbiddenError();
      return epoch;
    })
  }))();
  return Object.assign({ default: module }, module);
});
/**
 * Covers the controllers that talk to Mongoose models directly (older style):
 * config.
 */
vi.mock('../../models/Config', async () => {
  const module = await (() => {
    const ctor = Object.assign(vi.fn(), {
      find: vi.fn(),
      findOne: vi.fn(),
      findById: vi.fn(),
      countDocuments: vi.fn()
    });
    return { __esModule: true, default: ctor };
  })();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/Training', async () => {
  const module = await (() => ({
    __esModule: true,
    default: { findById: vi.fn(), findOne: vi.fn(), distinct: vi.fn().mockResolvedValue([]) }
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../clients/fileServiceClient', async () => {
  const module = await (() => ({
    getSignedUrl: vi.fn(),
    getUploadSignedUrl: vi.fn(),
    getFileMetadata: vi.fn(),
    deleteFile: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/projectAccessService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/projectAccessService')>(
      '../../services/projectAccessService'
    )),
    checkProjectAccess: vi.fn().mockResolvedValue(true),
    getVisibleProjectIds: vi.fn().mockResolvedValue([]),
    resolveProject: vi.fn().mockResolvedValue({ _id: { toString: () => 'p1' } })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});

import type { Request, Response } from 'express';
import * as configCtrl from '../../controllers/configController';
import Config from '../../models/Config';
import Training from '../../models/Training';

const mockedConfig = Config as unknown as Mock & Record<string, Mock>;
const mockedTraining = Training as unknown as Record<string, Mock>;

type AnyDoc = Record<string, unknown>;

type MockRes = Response & { json: Mock; status: Mock };

const makeRes = (): MockRes => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, query: {}, body: {}, user: { id: 'u1' }, ...overrides }) as unknown as Request;

const mockChain = (target: Mock, docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: vi.fn().mockReturnValue(chain),
    limit: vi.fn().mockReturnValue(chain),
    skip: vi.fn().mockReturnValue(chain),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject)
  });
  target.mockReturnValue(chain);
  return chain;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('configController', () => {
  it('getAllConfigs returns everything without pagination', async () => {
    mockChain(mockedConfig.find, [{ _id: 'c1' }]);
    const res = makeRes();

    await configCtrl.getAllConfigs(makeReq({ query: { sortBy: 'createdAt', order: -1 } }), res);

    expect(res.json.mock.calls[0][0].data).toEqual({ configs: [{ _id: 'c1' }], total: 1 });
  });

  it('getAllConfigs paginates when page+limit are given', async () => {
    mockChain(mockedConfig.find, [{ _id: 'c1' }]);
    mockedConfig.countDocuments.mockResolvedValue(11);
    const res = makeRes();

    await configCtrl.getAllConfigs(makeReq({ query: { page: 2, limit: 5, sortBy: 'createdAt', order: -1 } }), res);

    expect(res.json.mock.calls[0][0].data.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      pages: 3
    });
  });

  it('getConfigsByTraining handles missing training, linked config, and none', async () => {
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), makeRes())).rejects.toThrow(
      'Training not found'
    );

    mockedTraining.findOne.mockResolvedValue({ _id: 't1', configId: 'c1' });
    mockedConfig.findOne.mockResolvedValue({ _id: 'c1' });
    const res = makeRes();
    await configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), res);
    expect(res.json.mock.calls[0][0].data.total).toBe(1);

    mockedTraining.findOne.mockResolvedValue({ _id: 't1' });
    const res2 = makeRes();
    await configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), res2);
    expect(res2.json.mock.calls[0][0].data.total).toBe(0);
  });

  it('getConfigById / getConfigByUuid 404 or return', async () => {
    await expect(configCtrl.getConfigById(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Config not found'
    );
    expect(mockedConfig.findOne).not.toHaveBeenCalled();

    mockedConfig.findOne.mockResolvedValue(null);
    await expect(
      configCtrl.getConfigById(makeReq({ params: { id: '64b7f1f77bcf86cd79943aaa' } }), makeRes())
    ).rejects.toThrow('Config not found');

    mockedConfig.findOne.mockResolvedValue(null);
    await expect(configCtrl.getConfigByUuid(makeReq({ params: { uuid: 'x' } }), makeRes())).rejects.toThrow(
      'Config not found'
    );

    mockedConfig.findOne.mockResolvedValue({ _id: 'c1' });
    const res = makeRes();
    await configCtrl.getConfigByUuid(makeReq({ params: { uuid: 'u' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'c1' } });
  });

  it('createConfig and createConfigFromJson generate a uuid and save', async () => {
    mockedConfig.mockImplementation(function (d: AnyDoc) {
      return {
        ...d,
        save: vi.fn().mockResolvedValue({ ...d, _id: 'new' })
      };
    });
    const res = makeRes();

    await configCtrl.createConfig(makeReq({ body: { summary: 's', config_data: {}, projectId: 'slug' } }), res);
    expect(mockedConfig.mock.calls[0][0].config_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockedConfig.mock.calls[0][0].projectId).toBe('p1');
    expect(res.status).toHaveBeenCalledWith(201);

    await configCtrl.createConfigFromJson(
      makeReq({ body: { summary: 's2', config_data: {}, projectId: 'slug' } }),
      makeRes()
    );
    expect(mockedConfig.mock.calls[1][0].summary).toBe('s2');
  });
});
