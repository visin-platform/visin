jest.mock('../../models/TestResult', () => {
  const ctor = Object.assign(jest.fn(), {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn(),
  });
  return { __esModule: true, default: ctor };
});
jest.mock('../../models/Epoch', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock('../../models/Training', () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock('../../services/projectAccessService', () => ({
  checkProjectAccess: jest.fn(),
  getVisibleTrainingIds: jest.fn(),
  isWithinTokenScope: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { testResultService } from '../../services/testResultService';
import TestResult from '../../models/TestResult';
import Epoch from '../../models/Epoch';
import Training from '../../models/Training';
import {
  checkProjectAccess,
  getVisibleTrainingIds,
  isWithinTokenScope,
} from '../../services/projectAccessService';

const mockedTestResult = TestResult as unknown as jest.Mock & Record<string, jest.Mock>;
const mockedEpoch = Epoch as unknown as Record<string, jest.Mock>;
const mockedTraining = Training as unknown as Record<string, jest.Mock>;
const mockedCheckAccess = checkProjectAccess as jest.Mock;
const mockedVisibleTrainings = getVisibleTrainingIds as jest.Mock;
const mockedTokenScope = isWithinTokenScope as jest.Mock;

type AnyDoc = Record<string, any>;

const trDoc = (epochUuid: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: `tr-${epochUuid}`,
  epoch_uuid: epochUuid,
  epoch: 1,
  test_uuid: `test-${epochUuid}`,
  timestamp: new Date('2026-01-01'),
  test_results: { day: { car: { iou: 0.5 } } },
  toObject() {
    return { _id: this._id, epoch_uuid: this.epoch_uuid, test_uuid: this.test_uuid };
  },
  save: jest.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides,
});

const epochDoc = (epochUuid: string, trainingId: string): AnyDoc => ({
  _id: `eid-${epochUuid}`,
  epoch_uuid: epochUuid,
  epoch: 3,
  epoch_time: 60,
  trainingId: { toString: () => trainingId },
  results: { loss: 0.1 },
});

const trainingDoc = (id: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: { toString: () => id },
  uuid: `uuid-${id}`,
  name: `Training ${id}`,
  status: 'completed',
  projectId: 'p1',
  ...overrides,
});

// An awaitable mongoose-query stand-in supporting the chained calls the service uses.
const makeQuery = (results: unknown[]) => {
  const query: AnyDoc = {};
  Object.assign(query, {
    where: jest.fn().mockReturnValue(query),
    in: jest.fn().mockReturnValue(query),
    equals: jest.fn().mockReturnValue(query),
    sort: jest.fn().mockReturnValue(query),
    skip: jest.fn().mockReturnValue(query),
    limit: jest.fn().mockResolvedValue(results),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(results).then(resolve, reject),
  });
  return query;
};

const pagination = { sortBy: 'timestamp', order: -1 as const };

beforeEach(() => {
  jest.clearAllMocks();
  mockedCheckAccess.mockResolvedValue(true);
  mockedTokenScope.mockReturnValue(true);
});

describe('getTestResults', () => {
  it('scopes unfiltered queries to visible trainings and enriches results', async () => {
    const result1 = trDoc('e1');
    const query = makeQuery([result1]);
    mockedTestResult.find.mockReturnValue(query);
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    // 1st Epoch.find: visible epochs for scoping; 2nd: enrichment
    mockedEpoch.find
      .mockResolvedValueOnce([{ epoch_uuid: 'e1' }])
      .mockResolvedValueOnce([epochDoc('e1', 't1')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getTestResults('u1', {}, pagination)) as AnyDoc;

    expect(query.where).toHaveBeenCalledWith('epoch_uuid');
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0].training.name).toBe('Training t1');
    expect(result.testResults[0].epoch_info).toEqual({ epoch: 3, epoch_time: 60 });
    expect(result.total).toBe(1);
  });

  it('drops results whose training is gone', async () => {
    const query = makeQuery([trDoc('e1'), trDoc('e-orphan')]);
    mockedTestResult.find.mockReturnValue(query);
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    mockedEpoch.find
      .mockResolvedValueOnce([{ epoch_uuid: 'e1' }, { epoch_uuid: 'e-orphan' }])
      .mockResolvedValueOnce([epochDoc('e1', 't1'), epochDoc('e-orphan', 't-gone')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getTestResults('u1', {}, pagination)) as AnyDoc;

    expect(result.testResults).toHaveLength(1);
  });

  it('403s when a projectId filter is not accessible', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      testResultService.getTestResults('u1', { projectId: 'p-private' }, pagination)
    ).rejects.toThrow('Access denied to project');
  });

  it('returns empty for a project with no trainings', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedTraining.find.mockResolvedValue([]);

    const result = (await testResultService.getTestResults(
      'u1',
      { projectId: 'p1' },
      pagination
    )) as AnyDoc;

    expect(result.testResults).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('returns empty for a project whose trainings have no epochs', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);
    mockedEpoch.find.mockResolvedValueOnce([]);

    const result = (await testResultService.getTestResults(
      'u1',
      { projectId: 'p1' },
      pagination
    )) as AnyDoc;

    expect(result.testResults).toEqual([]);
  });

  it('404s for an unknown training_uuid filter', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedTraining.findOne.mockResolvedValue(null);

    await expect(
      testResultService.getTestResults('u1', { training_uuid: 'ghost' }, pagination)
    ).rejects.toThrow('Training not found');
  });

  it('403s for a training in an inaccessible project', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      testResultService.getTestResults('u1', { training_uuid: 'uuid-t1' }, pagination)
    ).rejects.toThrow('Access denied to project');
  });

  it('returns empty when the training has no epochs yet', async () => {
    mockedTestResult.find.mockReturnValue(makeQuery([]));
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedEpoch.find.mockResolvedValueOnce([]);

    await expect(
      testResultService.getTestResults('u1', { training_uuid: 'uuid-t1' }, pagination)
    ).resolves.toEqual({ testResults: [], total: 0 });
  });

  it('filters by epoch and epoch_uuids without extra scoping', async () => {
    const query = makeQuery([trDoc('e1')]);
    mockedTestResult.find.mockReturnValue(query);
    mockedEpoch.find.mockResolvedValueOnce([epochDoc('e1', 't1')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    await testResultService.getTestResults('u1', { epoch: 5, epoch_uuids: ['e1'] }, pagination);

    expect(query.equals).toHaveBeenCalledWith(5);
    expect(query.in).toHaveBeenCalledWith(['e1']);
    expect(mockedVisibleTrainings).not.toHaveBeenCalled();
  });

  it('paginates with a parallel count query', async () => {
    const query = makeQuery([trDoc('e1')]);
    mockedTestResult.find.mockReturnValue(query);
    mockedTestResult.countDocuments.mockResolvedValue(12);
    mockedEpoch.find
      .mockResolvedValueOnce([epochDoc('e1', 't1')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getTestResults(
      'u1',
      { epoch_uuids: ['e1'] },
      { page: 2, limit: 5, ...pagination }
    )) as AnyDoc;

    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.limit).toHaveBeenCalledWith(5);
    expect(mockedTestResult.countDocuments).toHaveBeenCalledWith({
      deletedAt: null,
      epoch_uuid: { $in: ['e1'] },
    });
    expect(result.pagination.page).toBe(2);
  });
});

describe('checkTestResultAccess', () => {
  it('allows orphaned results (no parent epoch)', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);

    await expect(testResultService.checkTestResultAccess('e-x', 'u1')).resolves.toBe(true);
  });

  it('denies when the training project is not accessible', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(testResultService.checkTestResultAccess('e1', 'u1')).resolves.toBe(false);
  });

  it('enforces API-token project scope', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedTokenScope.mockReturnValue(false);

    await expect(testResultService.checkTestResultAccess('e1', 'u1', 'p-other')).resolves.toBe(false);
    expect(mockedTokenScope).toHaveBeenCalledWith('p-other', 'p1');
  });
});

describe('getTestResultById / getTestResultByTestUuid', () => {
  it('404s when missing', async () => {
    mockedTestResult.findOne.mockResolvedValue(null);

    await expect(testResultService.getTestResultById('x', 'u1')).rejects.toThrow('Test result not found');
    await expect(testResultService.getTestResultByTestUuid('x', 'u1')).rejects.toThrow(
      'Test result not found'
    );
  });

  it('403s when access is denied', async () => {
    mockedTestResult.findOne.mockResolvedValue(trDoc('e1'));
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(testResultService.getTestResultById('x', 'u1')).rejects.toThrow();
    await expect(testResultService.getTestResultByTestUuid('x', 'u1')).rejects.toThrow();
  });

  it('returns the doc when accessible', async () => {
    const doc = trDoc('e1');
    mockedTestResult.findOne.mockResolvedValue(doc);
    mockedEpoch.findOne.mockResolvedValue(null);

    await expect(testResultService.getTestResultById('x', 'u1')).resolves.toBe(doc);
    await expect(testResultService.getTestResultByTestUuid('x', 'u1')).resolves.toBe(doc);
  });
});

describe('getTestResultsByEpochUuid', () => {
  it('403s when the epoch is not accessible', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      testResultService.getTestResultsByEpochUuid('e1', 'u1', pagination)
    ).rejects.toThrow();
  });

  it('returns enriched results without pagination', async () => {
    mockedEpoch.findOne.mockResolvedValue(null); // orphan check passes
    const query = makeQuery([trDoc('e1')]);
    mockedTestResult.find.mockReturnValue(query);
    mockedEpoch.find.mockResolvedValue([epochDoc('e1', 't1')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getTestResultsByEpochUuid('e1', 'u1', pagination)) as AnyDoc;

    expect(result.testResults[0].training.uuid).toBe('uuid-t1');
    expect(result.total).toBe(1);
  });

  it('paginates when page/limit are given', async () => {
    mockedEpoch.findOne.mockResolvedValue(null);
    const query = makeQuery([trDoc('e1')]);
    mockedTestResult.find.mockReturnValue(query);
    mockedEpoch.find.mockResolvedValue([epochDoc('e1', 't1')]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getTestResultsByEpochUuid('e1', 'u1', {
      page: 1,
      limit: 10,
      ...pagination,
    })) as AnyDoc;

    expect(query.skip).toHaveBeenCalledWith(0);
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, pages: 1 });
  });
});

describe('createTestResult', () => {
  beforeEach(() => {
    mockedTestResult.mockImplementation((data: AnyDoc) => ({
      ...data,
      save: jest.fn().mockResolvedValue({ ...data, _id: 'new' }),
    }));
  });

  it('409s on a duplicate test_uuid', async () => {
    mockedTestResult.findOne.mockResolvedValue(trDoc('e1'));

    await expect(
      testResultService.createTestResult('u1', undefined, { test_uuid: 'dup', epoch_uuid: 'e1' })
    ).rejects.toThrow('already exists');
  });

  it('403s when the parent training is out of reach or scope', async () => {
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(
      testResultService.createTestResult('u1', undefined, { epoch_uuid: 'e1', epoch: 1, test_results: {} })
    ).rejects.toThrow();
  });

  it('creates with a generated test_uuid and touches parent timestamps', async () => {
    mockedTestResult.findOne.mockResolvedValue(null);
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedEpoch.findByIdAndUpdate.mockResolvedValue({});
    mockedTraining.findByIdAndUpdate.mockResolvedValue({});

    const result = (await testResultService.createTestResult('u1', undefined, {
      epoch: 1,
      epoch_uuid: 'e1',
      test_results: { day: {} },
    })) as AnyDoc;

    const ctorArg = mockedTestResult.mock.calls[0][0];
    expect(ctorArg.test_uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctorArg.timestamp).toBeInstanceOf(Date);
    expect(mockedEpoch.findByIdAndUpdate).toHaveBeenCalled();
    expect(mockedTraining.findByIdAndUpdate).toHaveBeenCalled();
    expect(result._id).toBe('new');
  });

  it('survives a failed timestamp update', async () => {
    mockedTestResult.findOne.mockResolvedValue(null);
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedEpoch.findByIdAndUpdate.mockRejectedValue(new Error('db hiccup'));

    await expect(
      testResultService.createTestResult('u1', undefined, {
        epoch: 1,
        epoch_uuid: 'e1',
        test_results: {},
        timestamp: '2026-01-01',
      })
    ).resolves.toBeDefined();
  });

  it('creates for an orphan epoch_uuid without access checks', async () => {
    mockedTestResult.findOne.mockResolvedValue(null);
    mockedEpoch.findOne.mockResolvedValue(null);

    await testResultService.createTestResult(undefined, undefined, {
      epoch: 1,
      epoch_uuid: 'nowhere',
      test_results: {},
    });

    expect(mockedCheckAccess).not.toHaveBeenCalled();
  });
});

describe('updateTestResult / deleteTestResult', () => {
  it('404s when missing', async () => {
    mockedTestResult.findOne.mockResolvedValue(null);

    await expect(testResultService.updateTestResult('x', 'u1', undefined, {})).rejects.toThrow(
      'Test result not found'
    );
    await expect(testResultService.deleteTestResult('x', 'u1', undefined)).rejects.toThrow(
      'Test result not found'
    );
  });

  it('403s when access is denied', async () => {
    mockedTestResult.findOne.mockResolvedValue(trDoc('e1'));
    mockedEpoch.findOne.mockResolvedValue(epochDoc('e1', 't1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(testResultService.updateTestResult('x', 'u1', undefined, {})).rejects.toThrow();
    await expect(testResultService.deleteTestResult('x', 'u1', undefined)).rejects.toThrow();
  });

  it('applies partial updates and touches parent timestamps', async () => {
    const doc = trDoc('e1');
    mockedTestResult.findOne.mockResolvedValue(doc);
    mockedEpoch.findOne
      .mockResolvedValueOnce(null) // access check: orphan → allowed
      .mockResolvedValueOnce(epochDoc('e2', 't1')); // timestamp update lookup
    mockedEpoch.findByIdAndUpdate.mockResolvedValue({});
    mockedTraining.findByIdAndUpdate.mockResolvedValue({});

    await testResultService.updateTestResult('x', 'u1', undefined, {
      epoch: 9,
      epoch_uuid: 'e2',
      timestamp: '2026-02-01',
      test_results: { night: {} },
    });

    expect(doc.epoch).toBe(9);
    expect(doc.epoch_uuid).toBe('e2');
    expect(doc.timestamp).toEqual(new Date('2026-02-01'));
    expect(doc.test_results).toEqual({ night: {} });
    expect(doc.save).toHaveBeenCalled();
    expect(mockedEpoch.findOne).toHaveBeenLastCalledWith({ epoch_uuid: 'e2' });
  });

  it('soft-deletes', async () => {
    const doc = trDoc('e1');
    mockedTestResult.findOne.mockResolvedValue(doc);
    mockedEpoch.findOne.mockResolvedValue(null);

    await expect(testResultService.deleteTestResult('x', 'u1', undefined)).resolves.toBe(true);
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });
});

describe('getTestResultEpochs', () => {
  it('returns distinct epochs sorted', async () => {
    const sort = jest.fn().mockResolvedValue([1, 2, 3]);
    mockedTestResult.distinct.mockReturnValue({ sort });

    await expect(testResultService.getTestResultEpochs()).resolves.toEqual([1, 2, 3]);
    expect(mockedTestResult.distinct).toHaveBeenCalledWith('epoch');
  });
});

describe('compareTestResults', () => {
  it('drops results in inaccessible projects and strips mean_/inference keys', async () => {
    const visible = trDoc('e1', {
      test_results: {
        day: { car: { iou: 0.5 }, mean_iou: 0.5, inference_time: { avg: 3 } },
        inference_time: { avg_per_sample_ms: 12 },
      },
    });
    const hidden = trDoc('e2');
    mockedTestResult.find.mockResolvedValue([visible, hidden]);
    mockedEpoch.find.mockResolvedValue([epochDoc('e1', 't1'), epochDoc('e2', 't2')]);
    mockedTraining.find.mockResolvedValue([
      trainingDoc('t1'),
      trainingDoc('t2', { projectId: 'p-private' }),
    ]);
    mockedCheckAccess.mockImplementation(async (_u: string, projectId: string) => projectId !== 'p-private');

    const result = (await testResultService.compareTestResults('u1', ['a', 'b'])) as AnyDoc;

    expect(result.comparison).toHaveLength(1);
    expect(result.comparison[0].test_results.day).toEqual({ car: { iou: 0.5 } });
    expect(result.comparison[0].test_results).not.toHaveProperty('inference_time');
    expect(result.comparison[0].training.name).toBe('Training t1');
    expect(result.summary.totalTestResults).toBe(1);
    expect(result.summary.classes).toEqual(['car']);
  });

  it('handles an empty comparison', async () => {
    mockedTestResult.find.mockResolvedValue([]);
    mockedEpoch.find.mockResolvedValue([]);
    mockedTraining.find.mockResolvedValue([]);

    const result = (await testResultService.compareTestResults('u1', ['a'])) as AnyDoc;

    expect(result.comparison).toEqual([]);
    expect(result.summary.conditions).toEqual([]);
  });
});

describe('getAggregatedTestResultsByTraining', () => {
  it('aggregates only the latest result per training and skips invisible ones', async () => {
    mockedEpoch.find.mockResolvedValue([epochDoc('e1', 't1'), epochDoc('e2', 't2')]);
    const older = trDoc('e1', {
      timestamp: new Date('2026-01-01'),
      test_results: { day: { car: { iou: 0.2 } } },
    });
    const newer = trDoc('e1', {
      timestamp: new Date('2026-06-01'),
      test_results: { day: { car: { iou: 0.9 } } },
    });
    mockedTestResult.find.mockResolvedValue([older, newer]);
    mockedTraining.find.mockResolvedValue([
      trainingDoc('t1'),
      trainingDoc('t2', { projectId: 'p-private' }),
    ]);
    mockedCheckAccess.mockImplementation(async (_u: string, projectId: string) => projectId !== 'p-private');

    const result = (await testResultService.getAggregatedTestResultsByTraining('u1', [
      't1',
      't2',
    ])) as AnyDoc;

    expect(result.comparison).toHaveLength(1);
    expect(result.comparison[0].testResultsCount).toBe(2);
    // only the newest run is aggregated
    expect(result.comparison[0].aggregatedResults.day.car.iou.mean).toBeCloseTo(0.9);
  });

  it('returns a null aggregate for trainings without test results', async () => {
    mockedEpoch.find.mockResolvedValue([epochDoc('e1', 't1')]);
    mockedTestResult.find.mockResolvedValue([]);
    mockedTraining.find.mockResolvedValue([trainingDoc('t1')]);

    const result = (await testResultService.getAggregatedTestResultsByTraining('u1', ['t1'])) as AnyDoc;

    expect(result.comparison[0]).toEqual(
      expect.objectContaining({ aggregatedResults: null, testResultsCount: 0 })
    );
  });

  it('skips ids that resolve to no training at all', async () => {
    mockedEpoch.find.mockResolvedValue([]);
    mockedTestResult.find.mockResolvedValue([]);
    mockedTraining.find.mockResolvedValue([]);

    const result = (await testResultService.getAggregatedTestResultsByTraining('u1', ['ghost'])) as AnyDoc;

    expect(result.comparison).toEqual([]);
  });
});
