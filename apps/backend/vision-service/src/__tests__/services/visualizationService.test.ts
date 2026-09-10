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
jest.mock('../../models/EpochVisualization', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Epoch', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../services/fileServiceClient', () => ({
  getSignedUrl: jest.fn(),
  getUploadSignedUrl: jest.fn(),
}));
jest.mock('../../services/projectAccessService', () => ({
  ...jest.requireActual('../../services/projectAccessService'),
  checkProjectAccess: jest.fn(),
  getVisibleTrainingIds: jest.fn(),
  isWithinTokenScope: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  getVisualizationUploadUrl,
  createVisualization,
  getVisualizationByUuid,
  deleteVisualization,
  getVisualizationsByEpoch,
  getVisualizationsByTraining,
  getVisualizationTypes,
} from '../../services/visualizationService';
import EpochVisualization from '../../models/EpochVisualization';
import Epoch from '../../models/Epoch';
import Training from '../../models/Training';
import * as fileService from '../../services/fileServiceClient';
import {
  checkProjectAccess,
  getVisibleTrainingIds,
  isWithinTokenScope,
} from '../../services/projectAccessService';

const mockedViz = EpochVisualization as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedEpoch = Epoch as unknown as Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedFileService = fileService as unknown as Record<string, jest.Mock>;
const mockedCheckAccess = checkProjectAccess as jest.Mock;
const mockedVisibleTrainings = getVisibleTrainingIds as jest.Mock;
const mockedTokenScope = isWithinTokenScope as jest.Mock;

// Escape hatch for asserting on dynamically-shaped service results in tests;
// modeling every ad-hoc return shape as an interface here would add noise, not safety.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDoc = Record<string, any>;

const vizDoc = (uuid: string, overrides: AnyDoc = {}): AnyDoc => ({
  visualization_uuid: uuid,
  epoch_uuid: 'e1',
  fileId: `viz/${uuid}.png`,
  type: 'confusion_matrix',
  toObject() {
    return { visualization_uuid: this.visualization_uuid, epoch_uuid: this.epoch_uuid };
  },
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const epochDoc = (uuid: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: uuid,
  epoch_uuid: uuid,
  epoch: 4,
  trainingId: 't1',
  training_uuid: 'uuid-t1',
  ...overrides,
});

const signed = { signedUrl: 'http://signed', expiresAt: 'later', expiresInMinutes: 60 };

const mockVizFindChain = (docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: jest.fn().mockReturnValue(chain),
    skip: jest.fn().mockReturnValue(chain),
    limit: jest.fn().mockResolvedValue(docs),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject),
  });
  mockedViz.find.mockReturnValue(chain);
  return chain;
};

const mockEpochSelect = (docs: unknown[]) => {
  const select = jest.fn().mockResolvedValue(docs);
  mockedEpoch.find.mockReturnValue({ select });
  return select;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedCheckAccess.mockResolvedValue(true);
  mockedTokenScope.mockReturnValue(true);
  mockedFileService.getSignedUrl.mockResolvedValue(signed);
});

describe('getVisualizationUploadUrl', () => {
  const data = { epoch_uuid: 'e1', filename: 'plot.png', type: 'loss', mimetype: 'image/png' };

  it('404s for an unknown epoch', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);

    await expect(getVisualizationUploadUrl(data, 'u1', undefined)).rejects.toThrow('Epoch not found');
  });

  it('403s when the epoch is out of reach', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationUploadUrl(data, 'u1', undefined)).rejects.toThrow();
  });

  it('generates a uuid-keyed path and signed upload URL', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedFileService.getUploadSignedUrl.mockResolvedValue('http://upload');

    const result = await getVisualizationUploadUrl(data, 'u1', undefined);

    expect(result.uploadUrl).toBe('http://upload');
    expect(result.fileId).toMatch(/^visualizations\/e1\/loss\/[0-9a-f-]{36}\.png$/);
    expect(result.expiresInMinutes).toBe(15);
  });
});

describe('createVisualization', () => {
  const data = {
    epoch_uuid: 'e1',
    visualization_uuid: 'v1',
    filename: 'plot.png',
    type: 'loss',
    fileId: 'viz/v1.png',
    mimetype: 'image/png',
    size: 10,
  };

  it('404s for an unknown epoch and 403s without access', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);
    await expect(createVisualization(data, 'u1', undefined)).rejects.toThrow('Epoch not found');

    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);
    await expect(createVisualization(data, 'u1', undefined)).rejects.toThrow();
  });

  it('409s on a duplicate visualization uuid', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedViz.findOne.mockResolvedValue(vizDoc('v1'));

    await expect(createVisualization(data, 'u1', undefined)).rejects.toThrow('already exists');
  });

  it('saves with mimetype/size folded into metadata', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedViz.findOne.mockResolvedValue(null);
    const save = jest.fn().mockResolvedValue(undefined);
    mockedViz.mockImplementation((d: AnyDoc) => ({ ...d, save }));

    await createVisualization({ ...data, metadata: { note: 'x' } }, 'u1', undefined);

    const ctorArg = mockedViz.mock.calls[0][0];
    expect(ctorArg.metadata).toEqual({ note: 'x', mimetype: 'image/png', size: 10 });
    expect(save).toHaveBeenCalled();
  });
});

describe('getVisualizationByUuid / deleteVisualization', () => {
  it('404s when missing', async () => {
    mockedViz.findOne.mockResolvedValue(null);

    await expect(getVisualizationByUuid('v1', 'u1')).rejects.toThrow('Visualization not found');
    await expect(deleteVisualization('v1', 'u1', undefined)).rejects.toThrow('Visualization not found');
  });

  it('403s when the epoch is out of reach', async () => {
    mockedViz.findOne.mockResolvedValue(vizDoc('v1'));
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationByUuid('v1', 'u1')).rejects.toThrow();
    await expect(deleteVisualization('v1', 'u1', undefined)).rejects.toThrow();
  });

  it('returns the visualization with a signed URL', async () => {
    mockedViz.findOne.mockResolvedValue(vizDoc('v1'));
    mockedEpoch.findOne.mockResolvedValue(null); // orphan epoch → allowed

    const result = (await getVisualizationByUuid('v1', 'u1')) as AnyDoc;

    expect(result.signedUrl).toBe('http://signed');
    expect(result.urlExpiresAt).toBe('later');
  });

  it('deletes only the database record', async () => {
    mockedEpoch.findOne.mockResolvedValue({ _id: 'e1', trainingId: 't1' });
    mockedViz.findOne.mockResolvedValue(vizDoc('v1'));
    mockedViz.deleteOne.mockResolvedValue({});

    await deleteVisualization('v1', 'u1', undefined);

    expect(mockedViz.deleteOne).toHaveBeenCalledWith({ visualization_uuid: 'v1' });
  });
});

describe('getVisualizationsByEpoch', () => {
  it('403s when the epoch is out of reach', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationsByEpoch('e1', undefined, 'u1')).rejects.toThrow();
  });

  it('lists visualizations with signed URLs, filtered by type', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);
    mockVizFindChain([vizDoc('v1')]);

    const result = await getVisualizationsByEpoch('e1', 'loss', 'u1');

    expect(mockedViz.find).toHaveBeenCalledWith({ epoch_uuid: 'e1', type: 'loss' });
    expect(result.total).toBe(1);
    expect((result.visualizations[0] as AnyDoc).signedUrl).toBe('http://signed');
  });
});

describe('getVisualizationsByTraining', () => {
  const filters = { limit: 50, page: 1, includeUrls: 'true' };

  it('returns a paginated flat list for a specific training', async () => {
    mockedTraining.findOne.mockResolvedValue({ uuid: 'uuid-t1', projectId: 'p1' });
    mockEpochSelect([epochDoc('e1')]);
    mockedViz.countDocuments.mockResolvedValue(1);
    mockVizFindChain([vizDoc('v1')]);

    const result = (await getVisualizationsByTraining('uuid-t1', filters, 'u1')) as AnyDoc;

    expect(result.visualizations[0].epoch).toBe(4);
    expect(result.visualizations[0].signedUrl).toBe('http://signed');
    expect(result.pagination.total).toBe(1);
  });

  it('403s when the training project is not visible', async () => {
    mockedTraining.findOne.mockResolvedValue({ uuid: 'uuid-t1', projectId: 'p-private' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationsByTraining('uuid-t1', filters, 'u1')).rejects.toThrow();
  });

  it('returns empty when the training has no epochs', async () => {
    mockedTraining.findOne.mockResolvedValue(null);
    mockEpochSelect([]);

    const result = (await getVisualizationsByTraining('uuid-t1', filters, 'u1')) as AnyDoc;

    expect(result.visualizations).toEqual([]);
    expect(result.pagination.pages).toBe(0);
  });

  it('groups by training when only projectId is given', async () => {
    const sort = jest.fn().mockResolvedValue([
      { uuid: 'uuid-t1', name: 'T1' },
      { uuid: 'uuid-t2', name: 'T2' },
    ]);
    const select = jest.fn().mockReturnValue({ sort });
    mockedTraining.find.mockReturnValue({ select });
    // epochs for t1, none for t2
    const epochSelect = jest
      .fn()
      .mockResolvedValueOnce([epochDoc('e1')])
      .mockResolvedValueOnce([]);
    mockedEpoch.find.mockReturnValue({ select: epochSelect });
    mockVizFindChain([vizDoc('v1')]);

    const result = (await getVisualizationsByTraining(
      undefined,
      { ...filters, projectId: 'p1', includeUrls: 'false' },
      'u1'
    )) as AnyDoc;

    expect(result.trainings).toHaveLength(2);
    expect(result.trainings[0].visualizations[0].signedUrl).toBeUndefined();
    expect(result.trainings[1].visualizations).toEqual([]);
    expect(result.total).toBe(1);
  });

  it('403s for an inaccessible project and empties for a project without trainings', async () => {
    mockedCheckAccess.mockResolvedValueOnce(false);
    await expect(
      getVisualizationsByTraining(undefined, { ...filters, projectId: 'p1' }, 'u1')
    ).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    const sort = jest.fn().mockResolvedValue([]);
    const select = jest.fn().mockReturnValue({ sort });
    mockedTraining.find.mockReturnValue({ select });

    const result = (await getVisualizationsByTraining(
      undefined,
      { ...filters, projectId: 'p1' },
      'u1'
    )) as AnyDoc;
    expect(result).toEqual({ trainings: [], total: 0 });
  });

  it('falls back to a privacy-scoped global list without filters', async () => {
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    const epochSelect = jest
      .fn()
      .mockResolvedValueOnce([epochDoc('e1')]) // visible epochs
      .mockResolvedValueOnce([epochDoc('e1')]); // enrichment lookup
    mockedEpoch.find.mockReturnValue({ select: epochSelect });
    mockedViz.countDocuments.mockResolvedValue(1);
    mockVizFindChain([vizDoc('v1')]);

    const result = (await getVisualizationsByTraining(undefined, filters, 'u1')) as AnyDoc;

    expect(mockedVisibleTrainings).toHaveBeenCalledWith('u1');
    expect(result.visualizations[0].training_uuid).toBe('uuid-t1');
    expect(result.pagination.total).toBe(1);
  });
});

describe('getVisualizationTypes', () => {
  it('scopes by epoch_uuid with access check', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);
    mockedViz.distinct.mockResolvedValue(['b', 'a']);

    const types = await getVisualizationTypes(undefined, 'e1', 'u1');

    expect(mockedViz.distinct).toHaveBeenCalledWith('type', { epoch_uuid: 'e1' });
    expect(types).toEqual(['a', 'b']);
  });

  it('403s when the epoch is not accessible', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationTypes(undefined, 'e1', 'u1')).rejects.toThrow();
  });

  it('scopes by training_uuid via its epochs', async () => {
    mockedTraining.findOne.mockResolvedValue({ uuid: 'uuid-t1', projectId: 'p1' });
    mockEpochSelect([epochDoc('e1')]);
    mockedViz.distinct.mockResolvedValue([]);

    await getVisualizationTypes('uuid-t1', undefined, 'u1');

    expect(mockedViz.distinct).toHaveBeenCalledWith('type', { epoch_uuid: { $in: ['e1'] } });
  });

  it('403s when the training project is not visible', async () => {
    mockedTraining.findOne.mockResolvedValue({ uuid: 'uuid-t1', projectId: 'p-private' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationTypes('uuid-t1', undefined, 'u1')).rejects.toThrow();
  });
});
