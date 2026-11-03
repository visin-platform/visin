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
    assertLibraryWrite: vi.fn(),
    assertDatasetWrite: vi.fn(),
    assertEpochWrite: vi.fn(async function (uuid: string) {
      const epoch = await (await import('../../models/Epoch')).default.findOne({ epoch_uuid: uuid });
      if (!epoch)
        throw new (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).ForbiddenError();
      return epoch;
    })
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/EpochVisualization', async () => {
  const module = await (() => {
    const ctor = Object.assign(vi.fn(), {
      find: vi.fn(),
      findOne: vi.fn(),
      deleteOne: vi.fn(),
      countDocuments: vi.fn(),
      distinct: vi.fn()
    });
    return { __esModule: true, default: ctor };
  })();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/Epoch', async () => {
  const module = await (() => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/Training', async () => {
  const module = await (() => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), countDocuments: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../clients/fileServiceClient', async () => {
  const module = await (() => ({
    getSignedUrl: vi.fn(),
    getFileMetadata: vi.fn(),
    deleteFile: vi.fn(),
    getUploadSignedUrl: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('../../services/projectAccessService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/projectAccessService')>(
      '../../services/projectAccessService'
    )),
    checkProjectAccess: vi.fn(),
    getVisibleTrainingIds: vi.fn(),
    isWithinTokenScope: vi.fn(),
    resolveProject: vi.fn()
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

import {
  getVisualizationUploadUrl,
  createVisualization,
  getVisualizationByUuid,
  deleteVisualization,
  getVisualizationsByEpoch,
  getVisualizationsByTraining,
  getVisualizationTypes
} from '../../services/visualizationService';
import EpochVisualization from '../../models/EpochVisualization';
import Epoch from '../../models/Epoch';
import Training from '../../models/Training';
import * as fileService from '../../clients/fileServiceClient';
import {
  checkProjectAccess,
  getVisibleTrainingIds,
  isWithinTokenScope,
  resolveProject
} from '../../services/projectAccessService';

const mockedViz = EpochVisualization as unknown as Mock & Record<string, Mock>;
const mockedEpoch = Epoch as unknown as Record<string, Mock>;
const mockedTraining = Training as unknown as Record<string, Mock>;
const mockedFileService = fileService as unknown as Record<string, Mock>;
const mockedCheckAccess = checkProjectAccess as Mock;
const mockedVisibleTrainings = getVisibleTrainingIds as Mock;
const mockedTokenScope = isWithinTokenScope as Mock;
const mockedResolveProject = resolveProject as Mock;

// Escape hatch for asserting on dynamically-shaped service results in tests;
// modeling every ad-hoc return shape as an interface here would add noise, not safety.
// oxlint-disable-next-line typescript/no-explicit-any
type AnyDoc = Record<string, any>;

const vizDoc = (uuid: string, overrides: AnyDoc = {}): AnyDoc => ({
  visualization_uuid: uuid,
  epoch_uuid: 'e1',
  fileId: `viz/${uuid}.png`,
  type: 'confusion_matrix',
  toObject() {
    return { visualization_uuid: this.visualization_uuid, epoch_uuid: this.epoch_uuid };
  },
  save: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const epochDoc = (uuid: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: uuid,
  epoch_uuid: uuid,
  epoch: 4,
  trainingId: 't1',
  training_uuid: 'uuid-t1',
  ...overrides
});

const signed = { signedUrl: 'http://signed', expiresAt: 'later', expiresInMinutes: 60 };

const mockVizFindChain = (docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: vi.fn().mockReturnValue(chain),
    skip: vi.fn().mockReturnValue(chain),
    limit: vi.fn().mockResolvedValue(docs),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject)
  });
  mockedViz.find.mockReturnValue(chain);
  return chain;
};

const mockEpochSelect = (docs: unknown[]) => {
  const select = vi.fn().mockResolvedValue(docs);
  mockedEpoch.find.mockReturnValue({ select });
  return select;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolveProject.mockResolvedValue({ _id: { toString: () => 'p1' } });
  mockedTraining.findById.mockResolvedValue({ _id: 't1', projectId: 'p1' });
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
    size: 10
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
    const save = vi.fn().mockResolvedValue(undefined);
    mockedViz.mockImplementation(function (d: AnyDoc) {
      return { ...d, save };
    });

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
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));

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
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
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
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1', projectId: 'p1' });
    mockEpochSelect([epochDoc('e1')]);
    mockedViz.countDocuments.mockResolvedValue(1);
    mockVizFindChain([vizDoc('v1')]);

    const result = (await getVisualizationsByTraining('uuid-t1', filters, 'u1')) as AnyDoc;

    expect(result.visualizations[0].epoch).toBe(4);
    expect(result.visualizations[0].signedUrl).toBe('http://signed');
    expect(result.pagination.total).toBe(1);
  });

  it('narrows a training to one epoch', async () => {
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1', projectId: 'p1' });
    mockEpochSelect([epochDoc('e1')]);
    mockedViz.countDocuments.mockResolvedValue(1);
    mockVizFindChain([vizDoc('v1')]);

    await getVisualizationsByTraining('uuid-t1', { ...filters, epoch: 4 }, 'u1');

    expect(mockedEpoch.find).toHaveBeenCalledWith({ trainingId: 't1', deletedAt: null, epoch: 4 });
  });

  it('403s when the training project is not visible', async () => {
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1', projectId: 'p-private' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationsByTraining('uuid-t1', filters, 'u1')).rejects.toThrow();
  });

  it('returns empty when the training has no epochs', async () => {
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1' });
    mockEpochSelect([]);

    const result = (await getVisualizationsByTraining('uuid-t1', filters, 'u1')) as AnyDoc;

    expect(result.visualizations).toEqual([]);
    expect(result.pagination.pages).toBe(0);
  });

  it('groups by training when only projectId is given', async () => {
    const sort = vi.fn().mockResolvedValue([
      { _id: 't1', uuid: 'uuid-t1', name: 'T1' },
      { _id: 't2', uuid: 'uuid-t2', name: 'T2' }
    ]);
    const select = vi.fn().mockReturnValue({ sort });
    mockedTraining.find.mockReturnValue({ select });
    // epochs for t1, none for t2
    const epochSelect = vi
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
    // The id a run's page is opened by, beside the uuid the pipeline knows it by.
    expect(result.trainings.map((t: AnyDoc) => t.training_id)).toEqual(['t1', 't2']);
    expect(result.trainings[0].visualizations[0].signedUrl).toBeUndefined();
    expect(result.trainings[1].visualizations).toEqual([]);
    expect(result.total).toBe(1);
  });

  it("shows a few frames per run, a page of runs at a time, keeping each run's own counts by type whatever the filter", async () => {
    const limit = vi.fn().mockResolvedValue([{ _id: 't1', uuid: 'uuid-t1', name: 'T1' }]);
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    mockedTraining.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort }) });
    mockedTraining.countDocuments.mockResolvedValue(25);
    mockedEpoch.find.mockReturnValue({ select: vi.fn().mockResolvedValue([epochDoc('e1')]) });
    const frame = (id: string, type: string) => ({
      ...vizDoc(id),
      type,
      toObject: () => ({ _id: id, type, fileId: 'f', epoch_uuid: 'e1' })
    });
    mockVizFindChain([frame('v1', 'overlay'), frame('v2', 'overlay'), frame('v3', 'mask'), frame('v4', 'overlay')]);

    const result = (await getVisualizationsByTraining(
      undefined,
      { ...filters, limit: 12, page: 2, projectId: 'p1', type: 'overlay', perTraining: 2 },
      'u1'
    )) as AnyDoc;

    const [run] = result.trainings;
    expect(run.visualizations.map((v: AnyDoc) => v._id)).toEqual(['v1', 'v2']);
    expect(run.visualization_count).toBe(3);
    expect(run.type_counts).toEqual({ overlay: 3, mask: 1 });
    expect(result.total).toBe(3);
    expect(skip).toHaveBeenCalledWith(12);
    expect(limit).toHaveBeenCalledWith(12);
    expect(result.pagination).toEqual({ page: 2, limit: 12, total: 25, pages: 3 });
  });

  it('counts visualization types whose names overlap object properties', async () => {
    const sort = vi.fn().mockResolvedValue([{ _id: 't1', uuid: 'uuid-t1', name: 'T1' }]);
    mockedTraining.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort }) });
    mockEpochSelect([epochDoc('e1')]);
    mockVizFindChain([
      vizDoc('v1', { type: '__proto__' }),
      vizDoc('v2', { type: 'constructor' }),
      vizDoc('v3', { type: '__proto__' })
    ]);

    const result = (await getVisualizationsByTraining(undefined, { ...filters, projectId: 'p1' }, 'u1')) as AnyDoc;

    expect(JSON.parse(JSON.stringify(result.trainings[0].type_counts))).toEqual(
      Object.fromEntries([
        ['__proto__', 2],
        ['constructor', 1]
      ])
    );
  });

  it('answers every run, unpaged, when no gallery asked', async () => {
    const sort = vi.fn().mockResolvedValue([]);
    mockedTraining.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort }) });

    const result = (await getVisualizationsByTraining(undefined, { ...filters, projectId: 'p1' }, 'u1')) as AnyDoc;

    expect(result).toEqual({ trainings: [], total: 0 });
  });

  it('resolves a slug filter to the project id trainings are stored under', async () => {
    mockedResolveProject.mockResolvedValue({ _id: { toString: () => 'p-canonical' } });
    const sort = vi.fn().mockResolvedValue([]);
    mockedTraining.find.mockReturnValue({ select: vi.fn().mockReturnValue({ sort }) });

    await getVisualizationsByTraining(undefined, { ...filters, projectId: 'my-slug' }, 'u1');

    expect(mockedResolveProject).toHaveBeenCalledWith('my-slug');
    expect(mockedTraining.find).toHaveBeenCalledWith({ projectId: 'p-canonical', deletedAt: null });
  });

  it('403s for an inaccessible project and empties for a project without trainings', async () => {
    mockedCheckAccess.mockResolvedValueOnce(false);
    await expect(getVisualizationsByTraining(undefined, { ...filters, projectId: 'p1' }, 'u1')).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    const sort = vi.fn().mockResolvedValue([]);
    const select = vi.fn().mockReturnValue({ sort });
    mockedTraining.find.mockReturnValue({ select });

    const result = (await getVisualizationsByTraining(undefined, { ...filters, projectId: 'p1' }, 'u1')) as AnyDoc;
    expect(result).toEqual({ trainings: [], total: 0 });
  });

  it('falls back to a privacy-scoped global list without filters', async () => {
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    const epochSelect = vi
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
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1'));
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
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1', projectId: 'p1' });
    mockEpochSelect([epochDoc('e1')]);
    mockedViz.distinct.mockResolvedValue([]);

    await getVisualizationTypes('uuid-t1', undefined, 'u1');

    expect(mockedViz.distinct).toHaveBeenCalledWith('type', { epoch_uuid: { $in: ['e1'] } });
  });

  it('403s when the training project is not visible', async () => {
    mockedTraining.findOne.mockResolvedValue({ _id: 't1', uuid: 'uuid-t1', projectId: 'p-private' });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getVisualizationTypes('uuid-t1', undefined, 'u1')).rejects.toThrow();
  });
});
