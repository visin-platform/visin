jest.mock('../../models/Training', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Epoch', () => ({
  __esModule: true,
  default: { find: jest.fn(), updateMany: jest.fn() },
}));
jest.mock('../../models/TestResult', () => ({
  __esModule: true,
  default: { updateMany: jest.fn() },
}));
jest.mock('../../models/Benchmark', () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));
jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../models/Comparison', () => ({
  __esModule: true,
  default: { updateMany: jest.fn() },
}));
jest.mock('../../services/testResultService', () => ({
  testResultService: { getAggregatedTestResultsByTraining: jest.fn() },
}));
jest.mock('../../services/projectAccessService', () => ({
  checkProjectAccess: jest.fn(),
  getVisibleProjectIds: jest.fn(),
}));

import { trainingService } from '../../services/trainingService';
import Training from '../../models/Training';
import Epoch from '../../models/Epoch';
import TestResult from '../../models/TestResult';
import Benchmark from '../../models/Benchmark';
import Project from '../../models/Project';
import Comparison from '../../models/Comparison';
import { testResultService } from '../../services/testResultService';
import { checkProjectAccess, getVisibleProjectIds } from '../../services/projectAccessService';

const mockedTraining = Training as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedEpoch = Epoch as unknown as Record<string, jest.Mock>;
const mockedTestResult = TestResult as unknown as Record<string, jest.Mock>;
const mockedBenchmark = Benchmark as unknown as Record<string, jest.Mock>;
const mockedProject = Project as unknown as Record<string, jest.Mock>;
const mockedComparison = Comparison as unknown as Record<string, jest.Mock>;
const mockedCheckAccess = checkProjectAccess as jest.Mock;
const mockedVisibleProjects = getVisibleProjectIds as jest.Mock;
const mockedAggregated = testResultService.getAggregatedTestResultsByTraining as jest.Mock;

const VALID_ID = 'a'.repeat(24);

type AnyDoc = Record<string, any>;

const trainingDoc = (id: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: { toString: () => id },
  uuid: `uuid-${id}`,
  name: `Training ${id}`,
  projectId: 'p1',
  status: 'completed',
  toObject() {
    return { _id: this._id, name: this.name, projectId: this.projectId };
  },
  save: jest.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides,
});

const mockFindChain = (docs: unknown[]) => {
  const chain = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(docs),
  };
  mockedTraining.find.mockReturnValue(chain);
  return chain;
};

const mockProjectSelect = (ids: string[]) => {
  const select = jest.fn().mockResolvedValue(ids.map((id) => ({ _id: { toString: () => id } })));
  mockedProject.find.mockReturnValue({ select });
  return select;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedCheckAccess.mockResolvedValue(true);
});

describe('getTrainings', () => {
  it('scopes an authenticated caller to visible + unscoped trainings', async () => {
    mockProjectSelect(['p1']);
    const doc = trainingDoc('t1');
    mockFindChain([doc]);
    mockedTraining.countDocuments.mockResolvedValue(1);
    mockedTraining.aggregate.mockResolvedValue([
      { _id: { toString: () => 't1' }, metrics: { totalTime: 7200, epochCount: 2, maxEpoch: 2 } },
    ]);

    const result = await trainingService.getTrainings('u1', {}, { page: 2, limit: 10 });

    expect(mockedProject.find).toHaveBeenCalledWith({ $or: [{ isPublic: true }, { ownerId: 'u1' }] });
    expect(mockedTraining.find).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: null,
        $or: [{ projectId: { $in: ['p1'] } }, { projectId: { $exists: false } }],
      })
    );
    expect(result.trainings[0].metrics.totalTime).toBe(7200);
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, pages: 1 });
  });

  it('scopes anonymous callers to public projects only', async () => {
    mockProjectSelect(['pub']);
    mockFindChain([]);
    mockedTraining.countDocuments.mockResolvedValue(0);

    const result = await trainingService.getTrainings(undefined, {}, {});

    expect(mockedProject.find).toHaveBeenCalledWith({ isPublic: true });
    expect(mockedTraining.aggregate).not.toHaveBeenCalled();
    expect(result.trainings).toEqual([]);
    expect(result.pagination.pages).toBe(0);
  });

  it('applies search, status, dataset, and tag filters', async () => {
    mockProjectSelect([]);
    mockFindChain([]);
    mockedTraining.countDocuments.mockResolvedValue(0);

    await trainingService.getTrainings(
      'u1',
      { search: 'resnet', status: 'running', datasetId: 'd1', tags: ['a'] },
      {}
    );

    expect(mockedTraining.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $text: { $search: 'resnet' },
        status: 'running',
        datasetId: 'd1',
        tags: { $in: ['a'] },
      })
    );
  });

  it('requires all tags when several are given', async () => {
    mockProjectSelect([]);
    mockFindChain([]);
    mockedTraining.countDocuments.mockResolvedValue(0);

    await trainingService.getTrainings('u1', { tags: ['a', 'b'] }, {});

    expect(mockedTraining.find).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { $all: ['a', 'b'] } })
    );
  });

  it('filters by project when given, resolving slugs', async () => {
    mockedProject.findOne.mockResolvedValue({ _id: { toString: () => 'p9' } });
    mockFindChain([]);
    mockedTraining.countDocuments.mockResolvedValue(0);

    await trainingService.getTrainings('u1', { projectId: 'my-slug' }, {});

    expect(mockedProject.findOne).toHaveBeenCalledWith({ slug: 'my-slug' });
    expect(mockedTraining.find).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p9' }));
  });

  it('falls back to id lookup when the slug misses', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue({ _id: { toString: () => 'p9' } });
    mockFindChain([]);
    mockedTraining.countDocuments.mockResolvedValue(0);

    await trainingService.getTrainings('u1', { projectId: VALID_ID }, {});

    expect(mockedProject.findById).toHaveBeenCalledWith(VALID_ID);
  });

  it('404s for an unknown project filter', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);

    await expect(trainingService.getTrainings('u1', { projectId: 'ghost' }, {})).rejects.toThrow(
      'Project not found'
    );
  });

  it('403s when the caller cannot see the project filter', async () => {
    mockedProject.findOne.mockResolvedValue({ _id: { toString: () => 'p9' } });
    mockedCheckAccess.mockResolvedValue(false);

    await expect(trainingService.getTrainings('u1', { projectId: 'p9' }, {})).rejects.toThrow(
      'Access denied to project'
    );
  });

  it('fills default metrics for trainings absent from the aggregation', async () => {
    mockProjectSelect([]);
    mockFindChain([trainingDoc('t-solo')]);
    mockedTraining.countDocuments.mockResolvedValue(1);
    mockedTraining.aggregate.mockResolvedValue([]);

    const result = await trainingService.getTrainings('u1', {}, {});

    expect(result.trainings[0].metrics).toEqual({
      totalTime: 0,
      epochCount: 0,
      maxEpoch: 0,
      lastEpochTimestamp: null,
      cpuCost: 0,
      gpuCost: 0,
      totalCost: 0,
    });
  });
});

describe('getTrainingById / getTrainingByUuid / getTrainingWithEpochs', () => {
  it('404s when missing', async () => {
    mockedTraining.findOne.mockResolvedValue(null);

    await expect(trainingService.getTrainingById(VALID_ID, 'u1')).rejects.toThrow('Training not found');
    await expect(trainingService.getTrainingByUuid('uuid-x', 'u1')).rejects.toThrow('Training not found');
    await expect(
      trainingService.getTrainingWithEpochs(VALID_ID, 'u1', 'epoch', 1)
    ).rejects.toThrow('Training not found');
  });

  it('403s when project access is denied', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(trainingService.getTrainingById(VALID_ID, 'u1')).rejects.toThrow();
    await expect(trainingService.getTrainingByUuid('uuid-x', 'u1')).rejects.toThrow();
    await expect(trainingService.getTrainingWithEpochs(VALID_ID, 'u1', 'epoch', 1)).rejects.toThrow();
  });

  it('returns the training and, for withEpochs, its sorted epochs', async () => {
    const doc = trainingDoc('t1');
    mockedTraining.findOne.mockResolvedValue(doc);

    await expect(trainingService.getTrainingById(VALID_ID, 'u1')).resolves.toBe(doc);
    await expect(trainingService.getTrainingByUuid('uuid-t1', 'u1')).resolves.toBe(doc);

    const epochs = [{ epoch: 1 }];
    const sort = jest.fn().mockResolvedValue(epochs);
    mockedEpoch.find.mockReturnValue({ sort });

    const result = await trainingService.getTrainingWithEpochs(VALID_ID, 'u1', 'epoch', 1);

    expect(mockedEpoch.find).toHaveBeenCalledWith({ trainingId: VALID_ID, deletedAt: null });
    expect(sort).toHaveBeenCalledWith({ epoch: 1 });
    expect(result).toEqual({ training: doc, epochs });
  });
});

describe('createTraining', () => {
  beforeEach(() => {
    mockedTraining.mockImplementation((data: Record<string, unknown>) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data, _id: 'new-id' }),
    }));
  });

  it('rejects a blank name', async () => {
    await expect(trainingService.createTraining('u1', { name: '   ' })).rejects.toThrow(
      'Training name is required'
    );
  });

  it('creates with a generated uuid and normalized tags', async () => {
    const result = await trainingService.createTraining('u1', {
      name: ' My Training ',
      tags: 'single-tag',
    });

    const ctorArg = mockedTraining.mock.calls[0][0];
    expect(ctorArg.name).toBe('My Training');
    expect(ctorArg.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctorArg.tags).toEqual(['single-tag']);
    expect(ctorArg.status).toBe('pending');
    expect(result).toEqual(expect.objectContaining({ _id: 'new-id' }));
  });

  it('keeps a provided uuid and array tags', async () => {
    await trainingService.createTraining('u1', { name: 'T', uuid: 'fixed', tags: ['a', 'b'] });

    const ctorArg = mockedTraining.mock.calls[0][0];
    expect(ctorArg.uuid).toBe('fixed');
    expect(ctorArg.tags).toEqual(['a', 'b']);
  });

  it('403s when the target project is not accessible', async () => {
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      trainingService.createTraining('u1', { name: 'T', projectId: 'private' })
    ).rejects.toThrow('Access denied to project');
  });

  it('resolves a project slug to its id', async () => {
    mockedProject.findOne.mockResolvedValue({ _id: { toString: () => 'p9' } });

    await trainingService.createTraining('u1', { name: 'T', projectId: 'slug' });

    expect(mockedTraining.mock.calls[0][0].projectId).toBe('p9');
  });

  it('keeps the raw projectId when it resolves nowhere', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);

    await trainingService.createTraining('u1', { name: 'T', projectId: 'raw-id' });

    expect(mockedTraining.mock.calls[0][0].projectId).toBe('raw-id');
  });
});

describe('updateTraining', () => {
  it('rejects malformed ids', async () => {
    await expect(trainingService.updateTraining('nope', 'u1', {})).rejects.toThrow(
      'Invalid training ID format'
    );
  });

  it('404s / 403s appropriately', async () => {
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(trainingService.updateTraining(VALID_ID, 'u1', {})).rejects.toThrow(
      'Training not found'
    );

    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);
    await expect(trainingService.updateTraining(VALID_ID, 'u1', {})).rejects.toThrow();
  });

  it('applies only the provided fields', async () => {
    const doc = trainingDoc('t1', { description: 'old', tags: ['old'] });
    mockedTraining.findOne.mockResolvedValue(doc);

    await trainingService.updateTraining(VALID_ID, 'u1', {
      name: '  New ',
      status: 'failed',
      tags: 'solo',
      metadata: { k: 1 },
    });

    expect(doc.name).toBe('New');
    expect(doc.status).toBe('failed');
    expect(doc.tags).toEqual(['solo']);
    expect((doc as Record<string, unknown>).metadata).toEqual({ k: 1 });
    expect(doc.description).toBe('old');
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('deleteTraining', () => {
  it('rejects malformed ids', async () => {
    await expect(trainingService.deleteTraining('short', 'u1')).rejects.toThrow(
      'Invalid training ID format'
    );
  });

  it('404s / 403s appropriately', async () => {
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(trainingService.deleteTraining(VALID_ID, 'u1')).rejects.toThrow('Training not found');

    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);
    await expect(trainingService.deleteTraining(VALID_ID, 'u1')).rejects.toThrow();
  });

  it('cascades the soft delete to epochs, test results, and comparisons', async () => {
    const doc = trainingDoc('t1');
    mockedTraining.findOne.mockResolvedValue(doc);
    mockedEpoch.updateMany.mockResolvedValue({});
    mockedEpoch.find.mockResolvedValue([{ epoch_uuid: 'e1' }, { epoch_uuid: 'e2' }]);
    mockedTestResult.updateMany.mockResolvedValue({});
    mockedComparison.updateMany.mockResolvedValue({});

    await expect(trainingService.deleteTraining(VALID_ID, 'u1')).resolves.toBe(true);

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(mockedEpoch.updateMany).toHaveBeenCalledWith(
      { trainingId: VALID_ID },
      { deletedAt: expect.any(Date) }
    );
    expect(mockedTestResult.updateMany).toHaveBeenCalledWith(
      { epoch_uuid: { $in: ['e1', 'e2'] } },
      { deletedAt: expect.any(Date) }
    );
    expect(mockedComparison.updateMany).toHaveBeenCalledWith(
      { itemIds: VALID_ID },
      { $pull: { itemIds: VALID_ID }, updatedAt: expect.any(Date) }
    );
  });

  it('skips the test-result cascade when the training has no epochs', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedEpoch.updateMany.mockResolvedValue({});
    mockedEpoch.find.mockResolvedValue([]);
    mockedComparison.updateMany.mockResolvedValue({});

    await trainingService.deleteTraining(VALID_ID, 'u1');

    expect(mockedTestResult.updateMany).not.toHaveBeenCalled();
  });
});

describe('getTrainingStats', () => {
  it('returns zeroed stats when nothing matches', async () => {
    mockedVisibleProjects.mockResolvedValue([]);
    mockedTraining.aggregate.mockResolvedValue([]);

    const stats = await trainingService.getTrainingStats('u1', {});

    expect(stats.totalTrainings).toBe(0);
    expect(stats.filters).toEqual({ status: null, datasetId: null, projectId: null });
  });

  it('scopes unfiltered stats to visible projects', async () => {
    mockedVisibleProjects.mockResolvedValue(['p1']);
    mockedTraining.aggregate.mockResolvedValue([{ totalTrainings: 3, totalTime: 100 }]);

    const stats = await trainingService.getTrainingStats('u1', { status: 'completed', tags: ['a', 'b'] });

    const pipeline = mockedTraining.aggregate.mock.calls[0][0];
    expect(pipeline[0].$match).toEqual(
      expect.objectContaining({
        deletedAt: null,
        status: 'completed',
        tags: { $all: ['a', 'b'] },
        $or: [{ projectId: { $in: ['p1'] } }, { projectId: { $exists: false } }],
      })
    );
    expect(stats.totalTrainings).toBe(3);
  });

  it('403s when a project filter is not accessible', async () => {
    mockedCheckAccess.mockResolvedValue(false);

    await expect(trainingService.getTrainingStats('u1', { projectId: 'p1' })).rejects.toThrow(
      'Access denied to project'
    );
  });

  it('resolves the project filter (slug, id, then raw fallback)', async () => {
    mockedProject.findOne.mockResolvedValue(null);
    mockedProject.findById.mockResolvedValue(null);
    mockedTraining.aggregate.mockResolvedValue([]);

    await trainingService.getTrainingStats('u1', { projectId: 'raw', datasetId: 'd1', tags: ['x'] });

    const match = mockedTraining.aggregate.mock.calls[0][0][0].$match;
    expect(match.projectId).toBe('raw');
    expect(match.datasetId).toBe('d1');
    expect(match.tags).toEqual({ $in: ['x'] });
  });
});

describe('compareTrainings', () => {
  it('rejects more than 30 ids', async () => {
    await expect(
      trainingService.compareTrainings('u1', Array(31).fill('id'))
    ).rejects.toThrow('Maximum 30 trainings can be compared at once');
  });

  it('drops trainings in projects the caller cannot see', async () => {
    const visible = trainingDoc('t1');
    const hidden = trainingDoc('t2', { projectId: 'private' });
    mockedTraining.find.mockResolvedValue([visible, hidden]);
    mockedCheckAccess.mockImplementation(async (_u: string, projectId: string) => projectId !== 'private');
    const sort = jest.fn().mockResolvedValue([]);
    mockedEpoch.find.mockReturnValue({ sort });
    mockedAggregated.mockResolvedValue({ comparison: [] });
    const populate = jest.fn().mockResolvedValue([]);
    mockedBenchmark.find.mockReturnValue({ populate });

    const result = await trainingService.compareTrainings('u1', ['t1', 't2']);

    expect(result.comparison).toHaveLength(1);
    expect(result.comparison[0].training.name).toBe('Training t1');
    expect(result.summary.totalTrainings).toBe(1);
  });

  it('computes metrics, keeps only the latest benchmark, and summarizes', async () => {
    const doc = trainingDoc('t1');
    mockedTraining.find.mockResolvedValue([doc]);
    const epochs = [
      { trainingId: { toString: () => 't1' }, epoch: 1, epoch_time: 3600, epoch_uuid: 'e1', results: {}, timestamp: 1 },
      { trainingId: { toString: () => 't1' }, epoch: 2, epoch_time: 7200, epoch_uuid: 'e2', results: {}, timestamp: 2 },
    ];
    const sort = jest.fn().mockResolvedValue(epochs);
    mockedEpoch.find.mockReturnValue({ sort });
    mockedAggregated.mockResolvedValue({
      comparison: [
        {
          training: { _id: { toString: () => 't1' } },
          aggregatedResults: { mIoU: 0.7 },
          testResultsCount: 4,
        },
      ],
    });
    const benchmarks = [
      { training_id: { _id: { toString: () => 't1' } }, timestamp: '2026-01-01' },
      { training_id: 't1', timestamp: '2026-02-01' },
      { training_id: null, epoch_uuid: 'e1', timestamp: '2026-03-01' },
      { training_id: null, epoch_uuid: 'unknown', timestamp: '2026-04-01' },
    ];
    const populate = jest.fn().mockResolvedValue(benchmarks);
    mockedBenchmark.find.mockReturnValue({ populate });

    const result = await trainingService.compareTrainings('u1', ['t1']);

    const entry = result.comparison[0];
    expect(entry.metrics.totalEpochs).toBe(2);
    expect(entry.metrics.totalTime).toBe(10800);
    expect(entry.metrics.avgEpochTime).toBe(5400);
    expect(entry.metrics.maxEpochTime).toBe(7200);
    expect(entry.metrics.cost.totalHours).toBe(3);
    expect(entry.metrics.cost.totalCost).toBeCloseTo(3 * 0.206);
    expect(entry.lastEpoch?.epoch).toBe(2);
    expect(entry.aggregatedTestResults).toEqual({ mIoU: 0.7 });
    expect(entry.testResultsCount).toBe(4);
    // three benchmarks resolve to t1 (object id, string id, epoch fallback); latest wins
    expect(entry.benchmarks).toHaveLength(1);
    expect(entry.benchmarks[0].timestamp).toBe('2026-03-01');
    expect(result.summary).toEqual({
      totalTrainings: 1,
      trainingsWithEpochs: 1,
      trainingsWithTestResults: 1,
      trainingsWithBenchmarks: 1,
    });
  });

  it('handles trainings with no epochs, results, or benchmarks', async () => {
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);
    const sort = jest.fn().mockResolvedValue([]);
    mockedEpoch.find.mockReturnValue({ sort });
    mockedAggregated.mockResolvedValue({ comparison: [] });
    const populate = jest.fn().mockResolvedValue([]);
    mockedBenchmark.find.mockReturnValue({ populate });

    const result = await trainingService.compareTrainings(undefined, ['t1']);

    const entry = result.comparison[0];
    expect(entry.metrics.totalEpochs).toBe(0);
    expect(entry.metrics.avgEpochTime).toBe(0);
    expect(entry.metrics.maxEpochTime).toBe(0);
    expect(entry.lastEpoch).toBeNull();
    expect(entry.aggregatedTestResults).toBeNull();
    expect(entry.benchmarks).toEqual([]);
    expect(result.summary.trainingsWithEpochs).toBe(0);
  });
});
