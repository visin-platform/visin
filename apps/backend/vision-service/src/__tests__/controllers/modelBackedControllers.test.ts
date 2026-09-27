jest.mock('../../services/uploadReservationService', () => ({
  ...jest.requireActual('../../services/uploadReservationService'),
  reserveUpload: jest.fn(async () => ({ allocationId: 'reserved-id' })),
  claimUpload: jest.fn(async (_fileId: string, _kind: string, _parent: string, _resource: string, _user: string, resourceId?: string) => {
    const files = jest.requireMock('../../clients/fileServiceClient');
    const metadata = files.getFileMetadata ? await files.getFileMetadata(_fileId) : undefined;
    return { resourceId: resourceId || 'reserved-id', size: metadata?.size ?? 10 };
  }),
  deleteReservedFile: jest.fn(async (fileId: string) => jest.requireMock('../../clients/fileServiceClient').deleteFile(fileId))
}));
// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
jest.mock('../../services/writeAccessService', () => ({
  ...jest.requireActual('../../services/writeAccessService'),
  assertResourceWrite: jest.fn(async (resource: unknown) => {
    if (!resource) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
  }),
  assertEpochWrite: jest.fn(async (uuid: string) => {
    const epoch = await jest.requireMock('../../models/Epoch').default.findOne({ epoch_uuid: uuid });
    if (!epoch) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
    return epoch;
  })
}));
/**
 * Covers the controllers that talk to Mongoose models directly (older style):
 * config.
 */
jest.mock('../../models/Config', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn(), distinct: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../clients/fileServiceClient', () => ({
  getSignedUrl: jest.fn(),
  getUploadSignedUrl: jest.fn(),
  getFileMetadata: jest.fn(),
  deleteFile: jest.fn(),
}));
jest.mock('../../services/projectAccessService', () => ({
  ...jest.requireActual('../../services/projectAccessService'),
  checkProjectAccess: jest.fn().mockResolvedValue(true),
  getVisibleProjectIds: jest.fn().mockResolvedValue([]),
  resolveProject: jest.fn().mockResolvedValue({ _id: { toString: () => 'p1' } }),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Request, Response } from 'express';
import * as configCtrl from '../../controllers/configController';
import Config from '../../models/Config';
import Training from '../../models/Training';

const mockedConfig = Config as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;

type AnyDoc = Record<string, unknown>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, query: {}, body: {}, user: { id: 'u1' }, ...overrides } as unknown as Request);

const mockChain = (target: jest.Mock, docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: jest.fn().mockReturnValue(chain),
    limit: jest.fn().mockReturnValue(chain),
    skip: jest.fn().mockReturnValue(chain),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject),
  });
  target.mockReturnValue(chain);
  return chain;
};

beforeEach(() => {
  jest.clearAllMocks();
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

    await configCtrl.getAllConfigs(
      makeReq({ query: { page: 2, limit: 5, sortBy: 'createdAt', order: -1 } }),
      res
    );

    expect(res.json.mock.calls[0][0].data.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 11,
      pages: 3,
    });
  });

  it('getConfigsByTraining handles missing training, linked config, and none', async () => {
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(
      configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), makeRes())
    ).rejects.toThrow('Training not found');

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
    await expect(
      configCtrl.getConfigByUuid(makeReq({ params: { uuid: 'x' } }), makeRes())
    ).rejects.toThrow('Config not found');

    mockedConfig.findOne.mockResolvedValue({ _id: 'c1' });
    const res = makeRes();
    await configCtrl.getConfigByUuid(makeReq({ params: { uuid: 'u' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'c1' } });
  });

  it('createConfig and createConfigFromJson generate a uuid and save', async () => {
    mockedConfig.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));
    const res = makeRes();

    await configCtrl.createConfig(makeReq({ body: { summary: 's', config_data: {}, projectId: 'slug' } }), res);
    expect(mockedConfig.mock.calls[0][0].config_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockedConfig.mock.calls[0][0].projectId).toBe('p1');
    expect(res.status).toHaveBeenCalledWith(201);

    await configCtrl.createConfigFromJson(makeReq({ body: { summary: 's2', config_data: {}, projectId: 'slug' } }), makeRes());
    expect(mockedConfig.mock.calls[1][0].summary).toBe('s2');
  });
});

