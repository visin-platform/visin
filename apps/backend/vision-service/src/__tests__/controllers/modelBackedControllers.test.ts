import { claimUpload } from '../../services/uploadReservationService';
import { ForbiddenError } from '@visin/backend-core';
jest.mock('../../services/uploadReservationService', () => ({
  ...jest.requireActual('../../services/uploadReservationService'),
  reserveUpload: jest.fn(async () => ({ allocationId: 'reserved-id' })),
  claimUpload: jest.fn(async (_fileId: string, _kind: string, _parent: string, _resource: string, _user: string, resourceId?: string) => {
    const files = jest.requireMock('../../services/fileServiceClient');
    const metadata = files.getFileMetadata ? await files.getFileMetadata(_fileId) : undefined;
    return { resourceId: resourceId || 'reserved-id', size: metadata?.size ?? 10 };
  }),
  deleteReservedFile: jest.fn(async (fileId: string) => jest.requireMock('../../services/fileServiceClient').deleteFile(fileId))
}));
// These workflow tests stub the write-policy boundary. HTTP/Mongo integration
// tests exercise the real owner/group policy, parent resolution, and denial effects.
jest.mock('../../services/writeAccessService', () => ({
  ...jest.requireActual('../../services/writeAccessService'),
  assertResourceWrite: jest.fn(async (resource: unknown) => {
    if (!resource) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
  }),
  assertLibraryWrite: jest.fn(),
  assertDatasetWrite: jest.fn(),
  assertEpochWrite: jest.fn(async (uuid: string) => {
    const epoch = await jest.requireMock('../../models/Epoch').default.findOne({ epoch_uuid: uuid });
    if (!epoch) throw new (jest.requireActual('@visin/backend-core').ForbiddenError)();
    return epoch;
  })
}));
/**
 * Covers the controllers that talk to Mongoose models directly (older style):
 * analysis / config / dataset / imageCategory / apiToken.
 */
jest.mock('../../models/DatasetAnalysis', () => {
  const ctor = Object.assign(jest.fn(), {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Config', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Dataset', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/ImageCategory', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/DatasetImage', () => ({
  __esModule: true,
  default: { countDocuments: jest.fn() },
}));
jest.mock('../../models/ApiToken', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findById: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { findById: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../services/datasetImageService', () => ({
  getLabelingStats: jest.fn(),
}));
jest.mock('../../services/fileServiceClient', () => ({
  getSignedUrl: jest.fn(),
  getUploadSignedUrl: jest.fn(),
  getFileMetadata: jest.fn(),
  deleteFile: jest.fn(),
}));
jest.mock('../../services/projectAccessService', () => ({
  ...jest.requireActual('../../services/projectAccessService'),
  isProjectOwner: jest.fn(),
  checkProjectAccess: jest.fn().mockResolvedValue(true),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Request, Response } from 'express';
import * as analysisCtrl from '../../controllers/analysisController';
import * as configCtrl from '../../controllers/configController';
import * as datasetCtrl from '../../controllers/datasetController';
import * as categoryCtrl from '../../controllers/imageCategoryController';
import * as apiTokenCtrl from '../../controllers/apiTokenController';
import DatasetAnalysis from '../../models/DatasetAnalysis';
import Config from '../../models/Config';
import Dataset from '../../models/Dataset';
import ImageCategory from '../../models/ImageCategory';
import DatasetImage from '../../models/DatasetImage';
import ApiToken from '../../models/ApiToken';
import Training from '../../models/Training';
import { getLabelingStats } from '../../services/datasetImageService';
import { getSignedUrl, getUploadSignedUrl, getFileMetadata, deleteFile } from '../../services/fileServiceClient';
import { isProjectOwner } from '../../services/projectAccessService';

const mockedAnalysis = DatasetAnalysis as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedConfig = Config as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedDataset = Dataset as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedCategory = ImageCategory as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedImage = DatasetImage as unknown as Record<string, jest.Mock>;
const mockedApiToken = ApiToken as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedLabelingStats = getLabelingStats as jest.Mock;
const mockedGetSignedUrl = getSignedUrl as jest.Mock;
const mockedGetUploadUrl = getUploadSignedUrl as jest.Mock;
const mockedGetFileMetadata = getFileMetadata as jest.Mock;
const mockedDeleteFile = deleteFile as jest.Mock;
const FILE_ID = 'datasets/11111111-2222-4333-8444-555555555555/ds.zip';
const mockedIsOwner = isProjectOwner as jest.Mock;

type AnyDoc = Record<string, unknown>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, query: {}, body: {}, user: { id: 'u1' }, ...overrides } as unknown as Request);

const withToObject = (doc: AnyDoc): AnyDoc => ({
  ...doc,
  toObject() {
    const { toObject, save, ...rest } = this;
    return rest;
  },
  save: jest.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
});

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

describe('analysisController', () => {
  it('createUploadUrl issues a signed URL under a datasets/ path', async () => {
    mockedGetUploadUrl.mockResolvedValue('http://upload');
    const res = makeRes();

    await analysisCtrl.createUploadUrl(makeReq({ body: { filename: 'my ds.zip', mimetype: 'application/zip' } }), res);

    const [fileId, mimetype] = mockedGetUploadUrl.mock.calls[0];
    expect(fileId).toMatch(/^datasets\/[0-9a-f-]{36}\/my_ds\.zip$/);
    expect(mimetype).toBe('application/zip');
    expect(res.json.mock.calls[0][0].data.uploadUrl).toBe('http://upload');
  });

  it('createUploadUrl strips directory traversal out of the filename', async () => {
    mockedGetUploadUrl.mockResolvedValue('http://upload');

    await analysisCtrl.createUploadUrl(makeReq({ body: { filename: '../../etc/passwd', mimetype: 'text/plain' } }), makeRes());

    expect(mockedGetUploadUrl.mock.calls[0][0]).toMatch(/^datasets\/[0-9a-f-]{36}\/passwd$/);
  });

  it('createUploadUrl reserves a pending record when a dataset name is given', async () => {
    mockedGetUploadUrl.mockResolvedValue('http://upload');
    mockedAnalysis.create.mockResolvedValue({ _id: 'a1' });
    const res = makeRes();

    await analysisCtrl.createUploadUrl(
      makeReq({ body: { filename: 'ds.zip', mimetype: 'application/zip', dataset: 'waymo' } }),
      res
    );

    expect(mockedAnalysis.create).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: 'waymo', status: 'pending' })
    );
    expect(res.json.mock.calls[0][0].data.analysisId).toBe('a1');
  });

  it('createUploadUrl reserves nothing when replacing an existing archive', async () => {
    mockedGetUploadUrl.mockResolvedValue('http://upload');
    const res = makeRes();

    await analysisCtrl.createUploadUrl(makeReq({ body: { filename: 'ds.zip', mimetype: 'application/zip' } }), res);

    expect(mockedAnalysis.create).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.analysisId).toBeUndefined();
  });

  it('createUploadUrl issues no upload URL when the reservation is rejected', async () => {
    // The whole point of reserving first: a rejected create must fail before
    // the client can start sending bytes to a file nothing will claim.
    mockedAnalysis.create.mockRejectedValue(new Error('E11000 duplicate key error'));

    await expect(
      analysisCtrl.createUploadUrl(makeReq({ body: { filename: 'ds.zip', mimetype: 'application/zip', dataset: 'waymo' } }), makeRes())
    ).rejects.toThrow('E11000');
    expect(mockedGetUploadUrl).not.toHaveBeenCalled();
  });

  it('completeAnalysis flips a reserved record to ready and derives its size', async () => {
    const doc = withToObject({ _id: 'a1', dataset: 'waymo', fileId: FILE_ID, status: 'pending', data: {} });
    mockedAnalysis.findById.mockResolvedValue(doc);
    mockedGetFileMetadata.mockResolvedValue({ size: 3221225472 });
    const res = makeRes();

    await analysisCtrl.completeAnalysis(makeReq({ params: { id: 'a1' } }), res);

    expect(doc.status).toBe('ready');
    expect(doc.size).toBe('3.0 GB');
    expect(doc.save).toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe(FILE_ID);
  });

  it('completeAnalysis is idempotent for an already-ready record', async () => {
    const doc = withToObject({ _id: 'a1', dataset: 'waymo', fileId: FILE_ID, status: 'ready', size: '1.0 KB', data: {} });
    mockedAnalysis.findById.mockResolvedValue(doc);

    await analysisCtrl.completeAnalysis(makeReq({ params: { id: 'a1' } }), makeRes());

    expect(doc.save).not.toHaveBeenCalled();
    expect(doc.size).toBe('1.0 KB');
  });

  it('completeAnalysis 404s for an unknown id', async () => {
    mockedAnalysis.findById.mockResolvedValue(null);
    await expect(analysisCtrl.completeAnalysis(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );
  });

  it('completeAnalysis rejects a reservation that has no archive', async () => {
    mockedAnalysis.findById.mockResolvedValue(withToObject({ _id: 'a1', status: 'pending', data: {} }));
    await expect(analysisCtrl.completeAnalysis(makeReq({ params: { id: 'a1' } }), makeRes())).rejects.toThrow(
      'no uploaded archive'
    );
  });

  it('uploadAnalysis records the fileId and derives size from the stored file', async () => {
    mockedAnalysis.mockImplementation((d: AnyDoc) => withToObject({ ...d, _id: 'a1' }));
    mockedGetFileMetadata.mockResolvedValue({ size: 2621440 });
    const res = makeRes();

    await analysisCtrl.uploadAnalysis(makeReq({ body: { dataset: 'waymo', fileId: FILE_ID } }), res);

    expect(mockedAnalysis.mock.calls[0][0]).toMatchObject({ dataset: 'waymo', fileId: FILE_ID, size: '2.5 MB' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe(FILE_ID);
  });

  it('uploadAnalysis propagates reservation rejection before saving', async () => {
    jest.mocked(claimUpload).mockRejectedValueOnce(new ForbiddenError('Unreserved file'));
    await expect(
      analysisCtrl.uploadAnalysis(makeReq({ body: { dataset: 'waymo', fileId: 'u1/album/original.png' } }), makeRes())
    ).rejects.toThrow('Unreserved file');
    expect(mockedAnalysis).not.toHaveBeenCalled();
  });

  it('getAllAnalyses lists with dataset filter, pagination, and top-level downloadUrl', async () => {
    mockedAnalysis.countDocuments.mockResolvedValue(1);
    mockChain(mockedAnalysis.find, [withToObject({ _id: 'a1', data: { downloadUrl: 'http://dl' } })]);
    const res = makeRes();

    await analysisCtrl.getAllAnalyses(makeReq({ query: { dataset: 'waymo', limit: 5, skip: 0 } }), res);

    expect(mockedAnalysis.find).toHaveBeenCalledWith({ dataset: 'waymo', status: { $ne: 'pending' } });
    const body = res.json.mock.calls[0][0];
    expect(body.data[0].downloadUrl).toBe('http://dl');
    expect(body.pagination.total).toBe(1);
  });

  it('getAnalysisById 404s or returns with downloadUrl', async () => {
    mockedAnalysis.findById.mockResolvedValue(null);
    await expect(analysisCtrl.getAnalysisById(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );

    mockedAnalysis.findById.mockResolvedValue(withToObject({ _id: 'a1', data: {} }));
    const res = makeRes();
    await analysisCtrl.getAnalysisById(makeReq({ params: { id: 'a1' } }), res);
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBeUndefined();
  });

  it('updateAnalysis 404s for an unknown id', async () => {
    mockedAnalysis.findById.mockResolvedValue(null);
    await expect(analysisCtrl.updateAnalysis(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );
  });

  it('updateAnalysis renames without touching the stored analysis JSON', async () => {
    const doc = withToObject({ _id: 'a1', dataset: 'zod', fileId: FILE_ID, data: { k: 1 }, markModified: jest.fn() });
    mockedAnalysis.findById.mockResolvedValue(doc);
    const res = makeRes();

    await analysisCtrl.updateAnalysis(makeReq({ params: { id: 'a1' }, body: { dataset: 'renamed' } }), res);

    expect(doc.dataset).toBe('renamed');
    expect(doc.data).toEqual({ k: 1 });
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe(FILE_ID);
  });

  it('updateAnalysis re-reads size and drops the replaced archive when the file changes', async () => {
    const newFileId = 'datasets/99999999-2222-4333-8444-555555555555/new.zip';
    const doc = withToObject({ _id: 'a1', dataset: 'zod', fileId: FILE_ID, data: {}, markModified: jest.fn() });
    mockedAnalysis.findById.mockResolvedValue(doc);
    mockedGetFileMetadata.mockResolvedValue({ size: 1024 });

    await analysisCtrl.updateAnalysis(makeReq({ params: { id: 'a1' }, body: { fileId: newFileId } }), makeRes());

    expect(doc.fileId).toBe(newFileId);
    expect(doc.size).toBe('1.0 KB');
    expect(mockedDeleteFile).toHaveBeenCalledWith(FILE_ID);
  });

  it('downloadAnalysis signs the stored file and 404s when there is none', async () => {
    mockedAnalysis.findById.mockResolvedValue(withToObject({ _id: 'a1', fileId: FILE_ID, data: {} }));
    mockedGetSignedUrl.mockResolvedValue({ signedUrl: 'http://signed', expiresAt: 'later' });
    const res = makeRes();

    await analysisCtrl.downloadAnalysis(makeReq({ params: { id: 'a1' } }), res);
    expect(mockedGetSignedUrl).toHaveBeenCalledWith(FILE_ID, 60);
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe('http://signed');

    mockedAnalysis.findById.mockResolvedValue(withToObject({ _id: 'a1', data: {} }));
    await expect(analysisCtrl.downloadAnalysis(makeReq({ params: { id: 'a1' } }), makeRes())).rejects.toThrow(
      'no file to download'
    );
  });

  it('downloadAnalysis passes through a legacy external URL untouched', async () => {
    mockedAnalysis.findById.mockResolvedValue(
      withToObject({ _id: 'a1', data: { downloadUrl: 'https://cdn.example/ds.zip' } })
    );
    const res = makeRes();

    await analysisCtrl.downloadAnalysis(makeReq({ params: { id: 'a1' } }), res);

    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe('https://cdn.example/ds.zip');
  });

  it('getAnalysisByDataset pages results for one dataset', async () => {
    mockedAnalysis.countDocuments.mockResolvedValue(2);
    mockChain(mockedAnalysis.find, []);
    const res = makeRes();

    await analysisCtrl.getAnalysisByDataset(
      makeReq({ params: { name: 'waymo' }, query: { limit: 10, skip: 0 } }),
      res
    );

    expect(mockedAnalysis.find).toHaveBeenCalledWith({ dataset: 'waymo', status: { $ne: 'pending' } });
    expect(res.json.mock.calls[0][0].pagination.total).toBe(2);
  });

  it('deleteAnalysis 404s or deletes', async () => {
    mockedAnalysis.findById.mockResolvedValue(null);
    await expect(analysisCtrl.deleteAnalysis(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );

    mockedAnalysis.findById.mockResolvedValue({ _id: 'a1', fileId: FILE_ID });
    mockedAnalysis.findByIdAndDelete.mockResolvedValue({ _id: 'a1', fileId: FILE_ID });
    const res = makeRes();
    await analysisCtrl.deleteAnalysis(makeReq({ params: { id: 'a1' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockedDeleteFile).toHaveBeenCalledWith(FILE_ID);
  });

  it('compareAnalyses shapes comparison data and summary', async () => {
    mockChain(mockedAnalysis.find, [
      { _id: 'a1', dataset: 'waymo', data: { x: 1 }, createdAt: 1, updatedAt: 2 },
      { _id: 'a2', dataset: 'waymo', data: { x: 2 }, createdAt: 1, updatedAt: 2 },
    ]);
    const res = makeRes();

    await analysisCtrl.compareAnalyses(makeReq({ body: { analysisIds: ['a1', 'a2'] } }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.comparison).toHaveLength(2);
    expect(body.data.summary).toEqual({ totalAnalyses: 2, datasets: ['waymo'] });
  });
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
    mockedConfig.findById.mockResolvedValue({ _id: 'c1' });
    const res = makeRes();
    await configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), res);
    expect(res.json.mock.calls[0][0].data.total).toBe(1);

    mockedTraining.findOne.mockResolvedValue({ _id: 't1' });
    const res2 = makeRes();
    await configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), res2);
    expect(res2.json.mock.calls[0][0].data.total).toBe(0);
  });

  it('getConfigById / getConfigByUuid 404 or return', async () => {
    mockedConfig.findById.mockResolvedValue(null);
    await expect(configCtrl.getConfigById(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Config not found'
    );

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

    await configCtrl.createConfig(makeReq({ body: { summary: 's', config_data: {} } }), res);
    expect(mockedConfig.mock.calls[0][0].config_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.status).toHaveBeenCalledWith(201);

    await configCtrl.createConfigFromJson(makeReq({ body: { summary: 's2', config_data: {} } }), makeRes());
    expect(mockedConfig.mock.calls[1][0].summary).toBe('s2');
  });
});

describe('datasetController', () => {
  it('getDatasets pages and searches', async () => {
    mockChain(mockedDataset.find, [{ _id: 'd1' }]);
    mockedDataset.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await datasetCtrl.getDatasets(
      makeReq({ query: { page: 1, limit: 10, search: 'way', sortBy: 'updatedAt', order: -1 } }),
      res
    );

    expect(mockedDataset.find).toHaveBeenCalledWith({ deletedAt: null, $text: { $search: 'way' } });
    expect(res.json.mock.calls[0][0].data.pagination.total).toBe(1);
  });

  it('getDatasetById / getDatasetByUuid 404 or return', async () => {
    mockedDataset.findOne.mockResolvedValue(null);
    await expect(datasetCtrl.getDatasetById(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Dataset not found'
    );
    await expect(
      datasetCtrl.getDatasetByUuid(makeReq({ params: { uuid: 'x' } }), makeRes())
    ).rejects.toThrow('Dataset not found');

    mockedDataset.findOne.mockResolvedValue({ _id: 'd1' });
    const res = makeRes();
    await datasetCtrl.getDatasetByUuid(makeReq({ params: { uuid: 'u' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { _id: 'd1' } });
  });

  it('createDataset generates a uuid and default timestamp', async () => {
    mockedDataset.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));
    const res = makeRes();

    await datasetCtrl.createDataset(makeReq({ body: { name: 'D' } }), res);

    const ctorArg = mockedDataset.mock.calls[0][0];
    expect(ctorArg.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctorArg.timestamp).toBeInstanceOf(Date);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getLabelingStats delegates to the service', async () => {
    mockedLabelingStats.mockResolvedValue({ total: 1 });
    const res = makeRes();

    await datasetCtrl.getLabelingStats(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { total: 1 } });
  });

  it('downloadDataset uses explicit storage paths or URLs and rejects missing locations', async () => {
    // stored storage path
    mockedDataset.findOne.mockResolvedValue({ uuid: 'u', name: 'D', downloadUrl: 'datasets/D.zip' });
    mockedGetSignedUrl.mockResolvedValue({ signedUrl: 'http://signed' });
    const res = makeRes();
    await datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'u' } }), res);
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe('http://signed');

    // absolute URL passes through
    mockedDataset.findOne.mockResolvedValue({ uuid: 'u', name: 'D', downloadUrl: 'https://cdn/x.zip' });
    const res2 = makeRes();
    await datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'u' } }), res2);
    expect(res2.json.mock.calls[0][0].data.downloadUrl).toBe('https://cdn/x.zip');

    mockedDataset.findOne.mockResolvedValue({ uuid: 'u', name: 'D' });
    mockedGetSignedUrl.mockClear();
    await expect(datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'u' } }), makeRes())).rejects.toThrow('no file to download');
    expect(mockedGetSignedUrl).not.toHaveBeenCalled();
  });

  it('downloadDataset 404s for missing dataset or unsignable URL', async () => {
    mockedDataset.findOne.mockResolvedValue(null);
    await expect(
      datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'x' } }), makeRes())
    ).rejects.toThrow('Dataset not found');

    mockedDataset.findOne.mockResolvedValue({ uuid: 'u', name: 'D', downloadUrl: 'datasets/D.zip' });
    mockedGetSignedUrl.mockResolvedValue(null);
    await expect(
      datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'u' } }), makeRes())
    ).rejects.toThrow('Could not generate signed URL');
  });
});

describe('imageCategoryController', () => {
  it('createImageCategory 409s on duplicates and saves otherwise', async () => {
    mockedCategory.findOne.mockResolvedValue({ _id: 'existing' });
    await expect(
      categoryCtrl.createImageCategory(makeReq({ body: { name: 'N', datasetId: 'd1' } }), makeRes())
    ).rejects.toThrow('already exists');

    mockedCategory.findOne.mockResolvedValue(null);
    mockedCategory.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new', name: d.name }),
    }));
    const res = makeRes();
    await categoryCtrl.createImageCategory(makeReq({ body: { name: 'N', datasetId: 'd1' } }), res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('list/lookup handlers return categories', async () => {
    mockChain(mockedCategory.find, [{ _id: 'c1' }]);
    const res = makeRes();
    await categoryCtrl.getCategoriesByDataset(makeReq({ params: { datasetId: 'd1' } }), res);
    expect(mockedCategory.find).toHaveBeenCalledWith({ datasetId: 'd1' });

    await categoryCtrl.getAllCategories(makeReq(), makeRes());
    expect(mockedCategory.find).toHaveBeenLastCalledWith({});

    mockedCategory.findById.mockResolvedValue(null);
    await expect(
      categoryCtrl.getCategoryById(makeReq({ params: { id: 'x' } }), makeRes())
    ).rejects.toThrow('Image category not found');

    mockedCategory.findById.mockResolvedValue({ _id: 'c1' });
    const res2 = makeRes();
    await categoryCtrl.getCategoryById(makeReq({ params: { id: 'c1' } }), res2);
    expect(res2.json).toHaveBeenCalledWith({ success: true, data: { _id: 'c1' } });
  });

  it('updateCategory enforces per-dataset name uniqueness', async () => {
    mockedCategory.findById.mockResolvedValue({ _id: 'c1', datasetId: 'd1' });
    mockedCategory.findOne.mockResolvedValue({ _id: 'other' });

    await expect(
      categoryCtrl.updateCategory(makeReq({ params: { id: 'c1' }, body: { name: 'Taken' } }), makeRes())
    ).rejects.toThrow('already exists');
  });

  it('updateCategory 404s or applies the partial update', async () => {
    mockedCategory.findByIdAndUpdate.mockResolvedValue(null);
    await expect(
      categoryCtrl.updateCategory(makeReq({ params: { id: 'x' }, body: { color: 'red' } }), makeRes())
    ).rejects.toThrow('Image category not found');

    mockedCategory.findById.mockResolvedValue({ _id: 'c1', datasetId: 'd1' });
    mockedCategory.findOne.mockResolvedValue(null);
    mockedCategory.findByIdAndUpdate.mockResolvedValue({ _id: 'c1', name: 'New' });
    const res = makeRes();
    await categoryCtrl.updateCategory(
      makeReq({ params: { id: 'c1' }, body: { name: 'New', description: 'D', color: 'red' } }),
      res
    );
    expect(mockedCategory.findByIdAndUpdate).toHaveBeenCalledWith(
      'c1',
      { name: 'New', description: 'D', color: 'red' },
      { new: true }
    );
  });

  it('deleteCategory refuses when images still use it', async () => {
    mockedCategory.findById.mockResolvedValue(null);
    await expect(
      categoryCtrl.deleteCategory(makeReq({ params: { id: 'x' } }), makeRes())
    ).rejects.toThrow('Image category not found');

    mockedCategory.findById.mockResolvedValue({ _id: 'c1', datasetId: 'd1', name: 'N' });
    mockedImage.countDocuments.mockResolvedValue(3);
    await expect(
      categoryCtrl.deleteCategory(makeReq({ params: { id: 'c1' } }), makeRes())
    ).rejects.toThrow('being used by 3 image(s)');

    mockedImage.countDocuments.mockResolvedValue(0);
    mockedCategory.findByIdAndDelete.mockResolvedValue({});
    const res = makeRes();
    await categoryCtrl.deleteCategory(makeReq({ params: { id: 'c1' } }), res);
    expect(mockedCategory.findByIdAndDelete).toHaveBeenCalledWith('c1');
  });
});

describe('apiTokenController', () => {
  it('createToken is owner-only and returns the raw token exactly once', async () => {
    mockedIsOwner.mockResolvedValue(false);
    await expect(
      apiTokenCtrl.createToken(makeReq({ body: { name: 'T', projectId: 'p1' } }), makeRes())
    ).rejects.toThrow('Only the project owner');

    mockedIsOwner.mockResolvedValue(true);
    mockedApiToken.mockImplementation((d: AnyDoc) => ({
      ...d,
      toObject: () => ({ ...d }),
      save: jest.fn().mockResolvedValue(undefined),
    }));
    const res = makeRes();

    await apiTokenCtrl.createToken(
      makeReq({ body: { name: 'T', projectId: 'p1', expiresInDays: 30 } }),
      res
    );

    const ctorArg = mockedApiToken.mock.calls[0][0];
    expect(ctorArg.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(ctorArg.expiresAt).toBeInstanceOf(Date);
    const body = res.json.mock.calls[0][0];
    expect(body.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.data.prefix).toBe(body.data.token.substring(0, 7));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('createToken leaves expiresAt unset without expiresInDays', async () => {
    mockedIsOwner.mockResolvedValue(true);
    mockedApiToken.mockImplementation((d: AnyDoc) => ({
      ...d,
      toObject: () => ({ ...d }),
      save: jest.fn().mockResolvedValue(undefined),
    }));

    await apiTokenCtrl.createToken(makeReq({ body: { name: 'T', projectId: 'p1' } }), makeRes());

    expect(mockedApiToken.mock.calls[0][0].expiresAt).toBeUndefined();
  });

  it('getTokens is owner-only and lists active tokens', async () => {
    mockedIsOwner.mockResolvedValue(false);
    await expect(
      apiTokenCtrl.getTokens(makeReq({ params: { projectId: 'p1' } }), makeRes())
    ).rejects.toThrow('Only the project owner');

    mockedIsOwner.mockResolvedValue(true);
    mockChain(mockedApiToken.find, [{ _id: 't1' }]);
    const res = makeRes();
    await apiTokenCtrl.getTokens(makeReq({ params: { projectId: 'p1' } }), res);
    expect(mockedApiToken.find).toHaveBeenCalledWith({ projectId: 'p1', isActive: true });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ _id: 't1' }] });
  });

  it('revokeToken 404s, checks ownership, then deactivates', async () => {
    mockedApiToken.findById.mockResolvedValue(null);
    await expect(
      apiTokenCtrl.revokeToken(makeReq({ params: { id: 'x' } }), makeRes())
    ).rejects.toThrow('Token not found');

    const token: AnyDoc = {
      _id: 't1',
      projectId: { toString: () => 'p1' },
      isActive: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockedApiToken.findById.mockResolvedValue(token);
    mockedIsOwner.mockResolvedValue(false);
    await expect(
      apiTokenCtrl.revokeToken(makeReq({ params: { id: 't1' } }), makeRes())
    ).rejects.toThrow('Only the project owner');

    mockedIsOwner.mockResolvedValue(true);
    const res = makeRes();
    await apiTokenCtrl.revokeToken(makeReq({ params: { id: 't1' } }), res);
    expect(token.isActive).toBe(false);
    expect(token.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Token revoked' });
  });
});
