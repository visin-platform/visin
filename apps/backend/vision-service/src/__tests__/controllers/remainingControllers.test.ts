/**
 * Complements the existing epoch/comparison/datasetImage controller tests
 * with the handlers and branches those files don't cover.
 */
jest.mock('../../models/Epoch', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    countDocuments: jest.fn(),
    insertMany: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  },
}));
jest.mock('../../models/Comparison', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../services/projectAccessService', () => ({
  checkProjectAccess: jest.fn(),
  getVisibleProjectIds: jest.fn(),
  isWithinTokenScope: jest.fn(),
}));
jest.mock('../../services/datasetImageService', () => ({
  getImages: jest.fn(),
  createDatasetImage: jest.fn(),
  getAllImageStats: jest.fn(),
  getSimpleLabelingStats: jest.fn(),
  getImageById: jest.fn(),
  updateImage: jest.fn(),
  deleteImage: jest.fn(),
  exportImageNames: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Request, Response } from 'express';
import * as epochCtrl from '../../controllers/epochController';
import * as comparisonCtrl from '../../controllers/comparisonController';
import * as imageCtrl from '../../controllers/datasetImageController';
import Epoch from '../../models/Epoch';
import Training from '../../models/Training';
import Comparison from '../../models/Comparison';
import {
  checkProjectAccess,
  getVisibleProjectIds,
  isWithinTokenScope,
} from '../../services/projectAccessService';
import * as imageService from '../../services/datasetImageService';

const mockedEpoch = Epoch as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedComparison = Comparison as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedCheckAccess = checkProjectAccess as jest.Mock;
const mockedVisibleProjects = getVisibleProjectIds as jest.Mock;
const mockedTokenScope = isWithinTokenScope as jest.Mock;
const mockedImageSvc = imageService as unknown as Record<string, jest.Mock>;

type AnyDoc = Record<string, unknown>;

type MockRes = Response & { json: jest.Mock; status: jest.Mock; setHeader: jest.Mock; send: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, query: {}, body: {}, user: { id: 'u1' }, ...overrides } as unknown as Request);

const mockChain = (target: jest.Mock, docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: jest.fn().mockReturnValue(chain),
    skip: jest.fn().mockReturnValue(chain),
    limit: jest.fn().mockResolvedValue(docs),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject),
  });
  target.mockReturnValue(chain);
  return chain;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedCheckAccess.mockResolvedValue(true);
  mockedTokenScope.mockReturnValue(true);
});

describe('epochController.getEpochsByTraining', () => {
  it('404s / 403s before querying epochs', async () => {
    mockedTraining.findById.mockResolvedValue(null);
    await expect(
      epochCtrl.getEpochsByTraining(makeReq({ params: { trainingId: 't1' } }), makeRes())
    ).rejects.toThrow('Training not found');

    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);
    await expect(
      epochCtrl.getEpochsByTraining(makeReq({ params: { trainingId: 't1' } }), makeRes())
    ).rejects.toThrow();
  });

  it('returns all epochs without pagination', async () => {
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockChain(mockedEpoch.find, [{ epoch: 1 }]);
    const res = makeRes();

    await epochCtrl.getEpochsByTraining(
      makeReq({ params: { trainingId: 't1' }, query: { sortBy: 'epoch', order: 1 } }),
      res
    );

    expect(res.json.mock.calls[0][0].data).toEqual({ epochs: [{ epoch: 1 }], total: 1 });
  });

  it('paginates when page and limit are given', async () => {
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockChain(mockedEpoch.find, [{ epoch: 1 }]);
    mockedEpoch.countDocuments.mockResolvedValue(6);
    const res = makeRes();

    await epochCtrl.getEpochsByTraining(
      makeReq({ params: { trainingId: 't1' }, query: { page: 2, limit: 5, sortBy: 'epoch', order: 1 } }),
      res
    );

    expect(res.json.mock.calls[0][0].data.pagination).toEqual({
      page: 2,
      limit: 5,
      total: 6,
      pages: 2,
    });
  });
});

describe('epochController.createEpoch (token scope + success)', () => {
  it('403s when the training is outside the API token scope', async () => {
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedTokenScope.mockReturnValue(false);

    await expect(
      epochCtrl.createEpoch(
        makeReq({ projectId: 'p-token', body: { trainingId: 't1', epoch: 1, results: {} } }),
        makeRes()
      )
    ).rejects.toThrow("Training does not belong to the token's project");
  });

  it('creates the epoch and touches the training timestamp', async () => {
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedTraining.findByIdAndUpdate.mockResolvedValue({});
    mockedEpoch.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));
    const res = makeRes();

    await epochCtrl.createEpoch(
      makeReq({ body: { trainingId: 't1', training_uuid: 'tu', epoch: 1, results: { loss: 1 } } }),
      res
    );

    expect(mockedEpoch.mock.calls[0][0].epoch_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockedTraining.findByIdAndUpdate).toHaveBeenCalledWith('t1', { updatedAt: expect.any(Date) });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('epochController.updateEpoch', () => {
  it('404s / 403s appropriately', async () => {
    mockedEpoch.findById.mockResolvedValue(null);
    await expect(
      epochCtrl.updateEpoch(makeReq({ params: { id: 'e1' } }), makeRes())
    ).rejects.toThrow('Epoch not found');

    mockedEpoch.findById.mockResolvedValue({ trainingId: 't1' });
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);
    await expect(
      epochCtrl.updateEpoch(makeReq({ params: { id: 'e1' } }), makeRes())
    ).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    mockedTokenScope.mockReturnValue(false);
    await expect(
      epochCtrl.updateEpoch(makeReq({ params: { id: 'e1' }, projectId: 'p-token' }), makeRes())
    ).rejects.toThrow("Training does not belong to the token's project");
  });

  it('applies only provided fields and saves', async () => {
    const epoch: AnyDoc = {
      trainingId: 't1',
      epoch: 1,
      results: { old: true },
      save: jest.fn().mockImplementation(function (this: unknown) {
        return Promise.resolve(this);
      }),
    };
    mockedEpoch.findById.mockResolvedValue(epoch);
    mockedTraining.findById.mockResolvedValue({ projectId: 'p1' });
    const res = makeRes();

    await epochCtrl.updateEpoch(
      makeReq({
        params: { id: 'e1' },
        body: { results: { new: true }, learning_rate: 0.1, epoch_time: 60, metadata: { m: 1 } },
      }),
      res
    );

    expect(epoch.results).toEqual({ new: true });
    expect(epoch.learning_rate).toBe(0.1);
    expect(epoch.epoch_time).toBe(60);
    expect(epoch.metadata).toEqual({ m: 1 });
    expect(epoch.save).toHaveBeenCalled();
  });
});

describe('epochController.createEpochFromJson', () => {
  beforeEach(() => {
    mockedEpoch.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));
    mockedTraining.findByIdAndUpdate.mockResolvedValue({});
  });

  it('resolves the training by id', async () => {
    mockedTraining.findById.mockResolvedValue({ _id: 't1', uuid: 'tu', projectId: 'p1' });
    const res = makeRes();

    await epochCtrl.createEpochFromJson(
      makeReq({ body: { trainingId: 't1', epoch: 1, results: {} } }),
      res
    );

    expect(mockedEpoch.mock.calls[0][0]).toEqual(
      expect.objectContaining({ trainingId: 't1', training_uuid: 'tu' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('resolves the training by uuid', async () => {
    mockedTraining.findOne.mockResolvedValue({
      _id: { toString: () => 't1' },
      uuid: 'tu',
      projectId: 'p1',
    });

    await epochCtrl.createEpochFromJson(
      makeReq({ body: { training_uuid: 'tu', epoch: 1, results: {} } }),
      makeRes()
    );

    expect(mockedEpoch.mock.calls[0][0].trainingId).toBe('t1');
  });

  it('404s for unknown ids, 400s when neither identifier is given', async () => {
    mockedTraining.findById.mockResolvedValue(null);
    await expect(
      epochCtrl.createEpochFromJson(makeReq({ body: { trainingId: 'ghost' } }), makeRes())
    ).rejects.toThrow('Training not found with id: ghost');

    mockedTraining.findOne.mockResolvedValue(null);
    await expect(
      epochCtrl.createEpochFromJson(makeReq({ body: { training_uuid: 'ghost' } }), makeRes())
    ).rejects.toThrow('Training not found with uuid: ghost');

    await expect(epochCtrl.createEpochFromJson(makeReq(), makeRes())).rejects.toThrow(
      'Either trainingId or training_uuid is required'
    );
  });

  it('403s on access or token-scope failure and 409s on duplicate epoch_uuid', async () => {
    mockedTraining.findById.mockResolvedValue({ _id: 't1', uuid: 'tu', projectId: 'p1' });
    mockedCheckAccess.mockResolvedValueOnce(false);
    await expect(
      epochCtrl.createEpochFromJson(makeReq({ body: { trainingId: 't1' } }), makeRes())
    ).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    mockedTokenScope.mockReturnValueOnce(false);
    await expect(
      epochCtrl.createEpochFromJson(makeReq({ body: { trainingId: 't1' }, projectId: 'p-token' }), makeRes())
    ).rejects.toThrow("Training does not belong to the token's project");

    mockedTokenScope.mockReturnValue(true);
    mockedEpoch.findOne.mockResolvedValue({ epoch_uuid: 'dup' });
    await expect(
      epochCtrl.createEpochFromJson(
        makeReq({ body: { trainingId: 't1', epoch_uuid: 'dup' } }),
        makeRes()
      )
    ).rejects.toThrow('Epoch with uuid dup already exists');
  });
});

describe('epochController.createEpochsBatch', () => {
  it('verifies access to every referenced training before inserting', async () => {
    mockedTraining.find.mockResolvedValue([
      { _id: { toString: () => 't1' }, projectId: 'p1' },
    ]);
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      epochCtrl.createEpochsBatch(
        makeReq({ body: { epochs: [{ trainingId: 't1', training_uuid: 'tu', epoch: 1, results: {} }] } }),
        makeRes()
      )
    ).rejects.toThrow();
    expect(mockedEpoch.insertMany).not.toHaveBeenCalled();
  });

  it('403s when a referenced training does not exist at all', async () => {
    mockedTraining.find.mockResolvedValue([]);

    await expect(
      epochCtrl.createEpochsBatch(
        makeReq({ body: { epochs: [{ trainingId: 'ghost', training_uuid: 'tu', epoch: 1, results: {} }] } }),
        makeRes()
      )
    ).rejects.toThrow();
  });

  it('inserts prepared epochs and bumps every training timestamp', async () => {
    mockedTraining.find.mockResolvedValue([{ _id: { toString: () => 't1' }, projectId: 'p1' }]);
    mockedEpoch.insertMany.mockResolvedValue([{ _id: 'e1' }, { _id: 'e2' }]);
    mockedTraining.updateMany.mockResolvedValue({});
    const res = makeRes();

    await epochCtrl.createEpochsBatch(
      makeReq({
        body: {
          epochs: [
            { trainingId: 't1', training_uuid: 'tu', epoch: 1, results: {} },
            { trainingId: 't1', training_uuid: 'tu', epoch: 2, results: {}, epoch_uuid: 'keep' },
          ],
        },
      }),
      res
    );

    const inserted = mockedEpoch.insertMany.mock.calls[0][0];
    expect(inserted[0].epoch_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserted[1].epoch_uuid).toBe('keep');
    expect(mockedTraining.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['t1'] } },
      { updatedAt: expect.any(Date) }
    );
    expect(res.json.mock.calls[0][0].message).toBe('2 epochs created successfully');
  });
});

describe('comparisonController list/stats/update/delete', () => {
  it('getComparisons scopes to visible projects without a filter', async () => {
    mockedVisibleProjects.mockResolvedValue(['p1']);
    mockChain(mockedComparison.find, [{ _id: 'c1' }]);
    mockedComparison.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await comparisonCtrl.getComparisons(
      makeReq({ query: { sortBy: 'updatedAt', order: -1, search: 'x', type: 'trainings' } }),
      res
    );

    expect(mockedComparison.find).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: null,
        $text: { $search: 'x' },
        type: 'trainings',
        $or: [
          { projectId: { $in: ['p1'] } },
          { projectId: { $exists: false } },
          { projectId: null },
        ],
      })
    );
    expect(res.json.mock.calls[0][0].data.pagination.total).toBe(1);
  });

  it('getComparisons filters by an accessible project', async () => {
    mockChain(mockedComparison.find, []);
    mockedComparison.countDocuments.mockResolvedValue(0);

    await comparisonCtrl.getComparisons(
      makeReq({ query: { projectId: 'p1', sortBy: 'updatedAt', order: -1 } }),
      makeRes()
    );
    expect(mockedComparison.find).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1' })
    );

    mockedCheckAccess.mockResolvedValue(false);
    await expect(
      comparisonCtrl.getComparisons(
        makeReq({ query: { projectId: 'p1', sortBy: 'updatedAt', order: -1 } }),
        makeRes()
      )
    ).rejects.toThrow();
  });

  it('getComparisonByUuid 404s / 403s / returns', async () => {
    mockedComparison.findOne.mockResolvedValue(null);
    await expect(
      comparisonCtrl.getComparisonByUuid(makeReq({ params: { uuid: 'x' } }), makeRes())
    ).rejects.toThrow('Comparison not found');

    mockedComparison.findOne.mockResolvedValue({ uuid: 'x', projectId: 'p1' });
    mockedCheckAccess.mockResolvedValue(false);
    await expect(
      comparisonCtrl.getComparisonByUuid(makeReq({ params: { uuid: 'x' } }), makeRes())
    ).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    const res = makeRes();
    await comparisonCtrl.getComparisonByUuid(makeReq({ params: { uuid: 'x' } }), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { uuid: 'x', projectId: 'p1' } });
  });

  it('getComparisonStats aggregates by type with visibility scoping', async () => {
    mockedVisibleProjects.mockResolvedValue(['p1']);
    mockedComparison.aggregate.mockResolvedValue([{ _id: 'trainings', count: 2 }]);
    mockedComparison.countDocuments.mockResolvedValue(2);
    const res = makeRes();

    await comparisonCtrl.getComparisonStats(makeReq({ query: {} }), res);

    expect(res.json.mock.calls[0][0].data).toEqual({
      totalComparisons: 2,
      byType: [{ _id: 'trainings', count: 2 }],
      filters: { type: null },
    });
  });

  it('getComparisonStats honors type + project filters and denies invisible projects', async () => {
    mockedComparison.aggregate.mockResolvedValue([]);
    mockedComparison.countDocuments.mockResolvedValue(0);

    await comparisonCtrl.getComparisonStats(
      makeReq({ query: { type: 'tests', projectId: 'p1' } }),
      makeRes()
    );
    expect(mockedComparison.aggregate.mock.calls[0][0][0].$match).toEqual(
      expect.objectContaining({ type: 'tests', projectId: 'p1' })
    );

    mockedCheckAccess.mockResolvedValue(false);
    await expect(
      comparisonCtrl.getComparisonStats(makeReq({ query: { projectId: 'p1' } }), makeRes())
    ).rejects.toThrow();
  });

  it('updateComparison 404s / 403s / applies trimmed partial updates', async () => {
    mockedComparison.findOne.mockResolvedValue(null);
    await expect(
      comparisonCtrl.updateComparison(makeReq({ params: { id: 'c1' } }), makeRes())
    ).rejects.toThrow('Comparison not found');

    const doc: AnyDoc = {
      projectId: 'p1',
      name: 'Old',
      itemIds: ['a'],
      save: jest.fn().mockImplementation(function (this: unknown) {
        return Promise.resolve(this);
      }),
    };
    mockedComparison.findOne.mockResolvedValue(doc);
    mockedCheckAccess.mockResolvedValueOnce(false);
    await expect(
      comparisonCtrl.updateComparison(makeReq({ params: { id: 'c1' } }), makeRes())
    ).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    const res = makeRes();
    await comparisonCtrl.updateComparison(
      makeReq({
        params: { id: 'c1' },
        body: { name: ' New ', description: ' D ', itemIds: ['a', 'b'], metadata: { m: 1 } },
      }),
      res
    );
    expect(doc.name).toBe('New');
    expect(doc.description).toBe('D');
    expect(doc.itemIds).toEqual(['a', 'b']);
    expect(doc.metadata).toEqual({ m: 1 });
  });

  it('deleteComparison soft-deletes after access checks', async () => {
    mockedComparison.findOne.mockResolvedValue(null);
    await expect(
      comparisonCtrl.deleteComparison(makeReq({ params: { id: 'c1' } }), makeRes())
    ).rejects.toThrow('Comparison not found');

    const doc: AnyDoc = {
      projectId: 'p1',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockedComparison.findOne.mockResolvedValue(doc);
    const res = makeRes();
    await comparisonCtrl.deleteComparison(makeReq({ params: { id: 'c1' } }), res);

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Comparison deleted successfully' })
    );
  });

  it('createComparison saves with a generated uuid when the project is accessible', async () => {
    mockedComparison.mockImplementation((d: AnyDoc) => ({
      ...d,
      save: jest.fn().mockResolvedValue({ ...d, _id: 'new' }),
    }));
    const res = makeRes();

    await comparisonCtrl.createComparison(
      makeReq({ body: { name: 'C', type: 'trainings', itemIds: ['a'] } }),
      res
    );

    expect(mockedComparison.mock.calls[0][0].uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(mockedComparison.mock.calls[0][0].projectId).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('datasetImageController', () => {
  it('getAllImages splits space-separated tags and maps random flag', async () => {
    mockedImageSvc.getImages.mockResolvedValue({ images: [] });
    const res = makeRes();

    await imageCtrl.getAllImages(
      makeReq({ query: { page: 1, limit: 5, tags: 'good  bad', random: 'true' } }),
      res
    );

    expect(mockedImageSvc.getImages).toHaveBeenCalledWith({
      page: 1,
      limit: 5,
      search: undefined,
      tags: ['good', 'bad'],
      weatherCondition: undefined,
      random: true,
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { images: [] } });
  });

  it('getAllImages passes undefined tags through', async () => {
    mockedImageSvc.getImages.mockResolvedValue({ images: [] });

    await imageCtrl.getAllImages(makeReq({ query: { page: 1, limit: 5 } }), makeRes());

    expect(mockedImageSvc.getImages).toHaveBeenCalledWith(
      expect.objectContaining({ tags: undefined, random: false })
    );
  });

  it('createDatasetImage responds 201 with the saved image', async () => {
    mockedImageSvc.createDatasetImage.mockResolvedValue({ _id: 'img1' });
    const res = makeRes();

    await imageCtrl.createDatasetImage(
      makeReq({
        body: {
          filename: 'f.jpg',
          originalName: 'o.jpg',
          minioFileId: 'm',
          datasetId: 'd',
          categoryId: 'c',
          mimetype: 'image/jpeg',
          size: 1,
        },
      }),
      res
    );

    expect(mockedImageSvc.createDatasetImage).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'f.jpg', minioFileId: 'm' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('stats, lookup, update, and delete handlers delegate', async () => {
    mockedImageSvc.getAllImageStats.mockResolvedValue({ overview: {} });
    mockedImageSvc.getSimpleLabelingStats.mockResolvedValue({ total: 1 });
    mockedImageSvc.getImageById.mockResolvedValue({ _id: 'i' });
    mockedImageSvc.updateImage.mockResolvedValue({ _id: 'i' });
    mockedImageSvc.deleteImage.mockResolvedValue({ datasetId: 'd' });

    await imageCtrl.getAllImageStats(makeReq(), makeRes());
    expect(mockedImageSvc.getAllImageStats).toHaveBeenCalled();

    await imageCtrl.getSimpleLabelingStats(makeReq({ params: { datasetId: 'd' } }), makeRes());
    expect(mockedImageSvc.getSimpleLabelingStats).toHaveBeenCalledWith('d');

    await imageCtrl.getImageById(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedImageSvc.getImageById).toHaveBeenCalledWith('i');

    await imageCtrl.updateImage(makeReq({ params: { id: 'i' }, body: { title: 'T' } }), makeRes());
    expect(mockedImageSvc.updateImage).toHaveBeenCalledWith('i', expect.objectContaining({ title: 'T' }));

    await imageCtrl.deleteImage(makeReq({ params: { id: 'i' } }), makeRes());
    expect(mockedImageSvc.deleteImage).toHaveBeenCalledWith('i');
  });

  it('exportImageNames streams a CSV attachment', async () => {
    mockedImageSvc.exportImageNames.mockResolvedValue([{ filename: 'a.jpg' }, { filename: 'b.jpg' }]);
    const res = makeRes();

    await imageCtrl.exportImageNames(
      makeReq({ params: { datasetId: 'd1' }, query: { tag: 'good' } }),
      res
    );

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="images_good_d1.csv"'
    );
    expect(res.send).toHaveBeenCalledWith('camera/a.jpg\ncamera/b.jpg');
  });

  it('exportImageNames defaults the filename tag to all', async () => {
    mockedImageSvc.exportImageNames.mockResolvedValue([]);
    const res = makeRes();

    await imageCtrl.exportImageNames(makeReq({ params: { datasetId: 'd1' } }), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="images_all_d1.csv"'
    );
  });
});
