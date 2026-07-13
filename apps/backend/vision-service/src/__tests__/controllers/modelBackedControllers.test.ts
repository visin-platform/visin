/**
 * Covers the controllers that talk to Mongoose models directly (older style):
 * analysis / config / dataset / imageCategory / apiToken.
 */
jest.mock('../../models/DatasetAnalysis', () => {
  const ctor = Object.assign(jest.fn(), {
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
  default: { findById: jest.fn() },
}));
jest.mock('../../services/datasetImageService', () => ({
  getLabelingStats: jest.fn(),
}));
jest.mock('../../services/minioService', () => ({
  getSignedUrl: jest.fn(),
}));
jest.mock('../../services/projectAccessService', () => ({
  isProjectOwner: jest.fn(),
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
import { getSignedUrl } from '../../services/minioService';
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
const mockedIsOwner = isProjectOwner as jest.Mock;

type AnyDoc = Record<string, any>;

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
  it('uploadAnalysis stores data with downloadUrl folded in', async () => {
    mockedAnalysis.mockImplementation((d: AnyDoc) => withToObject({ ...d, _id: 'a1' }));
    const res = makeRes();

    await analysisCtrl.uploadAnalysis(
      makeReq({ body: { dataset: 'waymo', size: '1GB', data: { k: 1 }, downloadUrl: 'http://dl' } }),
      res
    );

    expect(mockedAnalysis.mock.calls[0][0].data).toEqual({ k: 1, downloadUrl: 'http://dl' });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('getAllAnalyses lists with dataset filter, pagination, and top-level downloadUrl', async () => {
    mockedAnalysis.countDocuments.mockResolvedValue(1);
    mockChain(mockedAnalysis.find, [withToObject({ _id: 'a1', data: { downloadUrl: 'http://dl' } })]);
    const res = makeRes();

    await analysisCtrl.getAllAnalyses(makeReq({ query: { dataset: 'waymo', limit: 5, skip: 0 } }), res);

    expect(mockedAnalysis.find).toHaveBeenCalledWith({ dataset: 'waymo' });
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

  it('updateAnalysis 404s or updates', async () => {
    mockedAnalysis.findByIdAndUpdate.mockResolvedValue(null);
    await expect(analysisCtrl.updateAnalysis(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );

    mockedAnalysis.findByIdAndUpdate.mockResolvedValue(
      withToObject({ _id: 'a1', dataset: 'zod', data: { downloadUrl: 'u' } })
    );
    const res = makeRes();
    await analysisCtrl.updateAnalysis(
      makeReq({ params: { id: 'a1' }, body: { dataset: 'zod', data: {} } }),
      res
    );
    expect(res.json.mock.calls[0][0].data.downloadUrl).toBe('u');
  });

  it('getAnalysisByDataset pages results for one dataset', async () => {
    mockedAnalysis.countDocuments.mockResolvedValue(2);
    mockChain(mockedAnalysis.find, []);
    const res = makeRes();

    await analysisCtrl.getAnalysisByDataset(
      makeReq({ params: { name: 'waymo' }, query: { limit: 10, skip: 0 } }),
      res
    );

    expect(mockedAnalysis.find).toHaveBeenCalledWith({ dataset: 'waymo' });
    expect(res.json.mock.calls[0][0].pagination.total).toBe(2);
  });

  it('deleteAnalysis 404s or deletes', async () => {
    mockedAnalysis.findByIdAndDelete.mockResolvedValue(null);
    await expect(analysisCtrl.deleteAnalysis(makeReq({ params: { id: 'x' } }), makeRes())).rejects.toThrow(
      'Analysis not found'
    );

    mockedAnalysis.findByIdAndDelete.mockResolvedValue({ _id: 'a1' });
    const res = makeRes();
    await analysisCtrl.deleteAnalysis(makeReq({ params: { id: 'a1' } }), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
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
    mockedTraining.findById.mockResolvedValue(null);
    await expect(
      configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), makeRes())
    ).rejects.toThrow('Training not found');

    mockedTraining.findById.mockResolvedValue({ _id: 't1', configId: 'c1' });
    mockedConfig.findById.mockResolvedValue({ _id: 'c1' });
    const res = makeRes();
    await configCtrl.getConfigsByTraining(makeReq({ params: { trainingId: 't1' } }), res);
    expect(res.json.mock.calls[0][0].data.total).toBe(1);

    mockedTraining.findById.mockResolvedValue({ _id: 't1' });
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

  it('downloadDataset covers stored MinIO path, absolute URL, and default fallback', async () => {
    // stored minio path
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

    // no stored URL → default path
    mockedDataset.findOne.mockResolvedValue({ uuid: 'u', name: 'D' });
    const res3 = makeRes();
    await datasetCtrl.downloadDataset(makeReq({ params: { uuid: 'u' } }), res3);
    expect(mockedGetSignedUrl).toHaveBeenLastCalledWith('datasets/D.zip', 60);
    expect(res3.json.mock.calls[0][0].data.downloadUrl).toBe('http://signed');
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

  it('getSignedUrlForPath signs arbitrary paths or 404s', async () => {
    mockedGetSignedUrl.mockResolvedValue({ signedUrl: 'http://s', expiresAt: 'later' });
    const res = makeRes();
    await datasetCtrl.getSignedUrlForPath(makeReq({ query: { path: 'a/b' } }), res);
    expect(res.json.mock.calls[0][0].data.signedUrl).toBe('http://s');

    mockedGetSignedUrl.mockResolvedValue(null);
    await expect(
      datasetCtrl.getSignedUrlForPath(makeReq({ query: { path: 'a/b' } }), makeRes())
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
