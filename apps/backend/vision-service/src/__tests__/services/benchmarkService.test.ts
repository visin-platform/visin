import Epoch from '../../models/Epoch';
import { vi, type Mock } from 'vitest';
vi.mock('../../models/Epoch', async () => {
  const module = await (() => ({
    __esModule: true,
    default: {
      findOne: vi.fn(async function () {
        return { trainingId: 't2' };
      })
    }
  }))();
  return Object.assign({ default: module }, module);
});
import { assertResourceWrite } from '../../services/writeAccessService';
import { ForbiddenError } from '@visin/backend-core';
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
vi.mock('../../models/Benchmark', async () => {
  const module = await (() => {
    const ctor = Object.assign(vi.fn(), {
      find: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn()
    });
    return { __esModule: true, default: ctor };
  })();
  return Object.assign({ default: module }, module);
});
vi.mock('../../models/Training', async () => {
  const module = await (() => ({
    __esModule: true,
    default: { find: vi.fn(), findOne: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() }
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
  getBenchmarks,
  getBenchmarkById,
  createBenchmark,
  uploadBenchmark,
  getBenchmarkStats,
  updateBenchmark,
  deleteBenchmark
} from '../../services/benchmarkService';
import Benchmark from '../../models/Benchmark';
import Training from '../../models/Training';
import {
  checkProjectAccess,
  getVisibleTrainingIds,
  isWithinTokenScope,
  resolveProject
} from '../../services/projectAccessService';
import type { CreateBenchmarkBody } from '../../validation/benchmarkSchemas';

const mockedBenchmark = Benchmark as unknown as Mock & Record<string, Mock>;
const mockedTraining = Training as unknown as Record<string, Mock>;
const mockedCheckAccess = checkProjectAccess as Mock;
const mockedVisibleTrainings = getVisibleTrainingIds as Mock;
const mockedTokenScope = isWithinTokenScope as Mock;
const mockedResolveProject = resolveProject as Mock;

// Escape hatch for asserting on dynamically-shaped service results in tests;
// modeling every ad-hoc return shape as an interface here would add noise, not safety.
// oxlint-disable-next-line typescript/no-explicit-any
type AnyDoc = Record<string, any>;

const benchmarkDoc = (overrides: AnyDoc = {}): AnyDoc => ({
  _id: 'b1',
  training_id: { toString: () => 't1' },
  training_uuid: 'uuid-t1',
  timestamp: new Date('2026-01-01'),
  system_info: { cpu_count: 8 },
  results: [],
  toObject() {
    return { _id: this._id, training_id: this.training_id, system_info: this.system_info };
  },
  save: vi.fn().mockImplementation(function (this: unknown) {
    return Promise.resolve(this);
  }),
  ...overrides
});

const trainingDoc = (id: string, overrides: AnyDoc = {}): AnyDoc => ({
  _id: { toString: () => id },
  uuid: `uuid-${id}`,
  name: `Training ${id}`,
  projectId: 'p1',
  ...overrides
});

const mockBenchmarkFindChain = (docs: unknown[]) => {
  const chain: AnyDoc = {};
  Object.assign(chain, {
    sort: vi.fn().mockReturnValue(chain),
    skip: vi.fn().mockReturnValue(chain),
    limit: vi.fn().mockResolvedValue(docs),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(docs).then(resolve, reject)
  });
  mockedBenchmark.find.mockReturnValue(chain);
  return chain;
};

const baseFilters = { sortBy: 'timestamp' as const, order: -1 as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockedResolveProject.mockResolvedValue({ _id: { toString: () => 'p1' } });
  mockedCheckAccess.mockResolvedValue(true);
  mockedTokenScope.mockReturnValue(true);
});

describe('getBenchmarks', () => {
  it('scopes unfiltered listings to benchmarks of visible trainings', async () => {
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    mockBenchmarkFindChain([benchmarkDoc()]);
    mockedBenchmark.countDocuments.mockResolvedValue(1);
    const select = vi.fn().mockResolvedValue([trainingDoc('t1')]);
    mockedTraining.find.mockReturnValue({ select });

    const result = await getBenchmarks(baseFilters, 'u1');

    expect(mockedBenchmark.find).toHaveBeenCalledWith({
      deletedAt: null,
      $or: [{ training_id: { $in: ['t1'] } }]
    });
    expect((result.benchmarks[0] as AnyDoc).training_id.name).toBe('Training t1');
    expect(result.pagination).toEqual({ page: 1, limit: 25, total: 1, pages: 1 });
  });

  it('403s for an inaccessible projectId and empties out for a training-less project', async () => {
    mockedCheckAccess.mockResolvedValueOnce(false);
    await expect(getBenchmarks({ ...baseFilters, projectId: 'p-x' }, 'u1')).rejects.toThrow();

    mockedCheckAccess.mockResolvedValue(true);
    mockedTraining.find.mockResolvedValue([]);
    const result = await getBenchmarks({ ...baseFilters, projectId: 'p-x' }, 'u1');
    expect(result.benchmarks).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('resolves a slug filter to the project id trainings are stored under', async () => {
    mockedResolveProject.mockResolvedValue({ _id: { toString: () => 'p-canonical' } });
    mockedTraining.find.mockResolvedValueOnce([]);

    await getBenchmarks({ ...baseFilters, projectId: 'my-slug' }, 'u1');

    expect(mockedResolveProject).toHaveBeenCalledWith('my-slug');
    expect(mockedTraining.find).toHaveBeenCalledWith({ projectId: 'p-canonical', deletedAt: null });
  });

  it('filters by project training ids when the project has trainings', async () => {
    mockedTraining.find.mockResolvedValueOnce([trainingDoc('t1')]);
    mockBenchmarkFindChain([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    await getBenchmarks({ ...baseFilters, projectId: 'p1' }, 'u1');

    expect(mockedBenchmark.find).toHaveBeenCalledWith({
      deletedAt: null,
      training_id: { $in: ['t1'] }
    });
  });

  it('filters by training_uuid with an access check', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockBenchmarkFindChain([]);
    mockedBenchmark.countDocuments.mockResolvedValue(0);

    await getBenchmarks({ ...baseFilters, training_uuid: 'uuid-t1' }, 'u1');
    expect(mockedBenchmark.find).toHaveBeenCalledWith({ deletedAt: null, training_uuid: 'uuid-t1' });

    mockedCheckAccess.mockResolvedValue(false);
    await expect(getBenchmarks({ ...baseFilters, training_uuid: 'uuid-t1' }, 'u1')).rejects.toThrow();
  });

  it('nulls the training reference when it cannot be resolved', async () => {
    mockedVisibleTrainings.mockResolvedValue([]);
    mockBenchmarkFindChain([benchmarkDoc()]);
    mockedBenchmark.countDocuments.mockResolvedValue(1);
    const select = vi.fn().mockRejectedValue(new Error('db'));
    mockedTraining.find.mockReturnValue({ select });

    const result = await getBenchmarks(baseFilters, 'u1');

    expect((result.benchmarks[0] as AnyDoc).training_id).toBeNull();
  });
});

describe('getBenchmarkById', () => {
  it('404s when missing', async () => {
    mockedBenchmark.findOne.mockResolvedValue(null);
    await expect(getBenchmarkById('b1', 'u1')).rejects.toThrow('Benchmark not found');
  });
  it('checks the raw parent before population', async () => {
    const doc = benchmarkDoc({ populate: vi.fn().mockResolvedValue(undefined) });
    mockedBenchmark.findOne.mockResolvedValue(doc);
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    await expect(getBenchmarkById('b1', 'u1')).resolves.toBe(doc);
    expect(doc.populate).toHaveBeenCalledWith('training_id', 'name uuid projectId');
    mockedCheckAccess.mockResolvedValue(false);
    doc.populate.mockClear();
    await expect(getBenchmarkById('b1', 'u1')).rejects.toThrow('Access denied');
    expect(doc.populate).not.toHaveBeenCalled();
  });
  it('does not treat an orphan UUID as standalone', async () => {
    mockedBenchmark.findOne.mockResolvedValue(benchmarkDoc({ training_id: null }));
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(getBenchmarkById('b1', 'u1')).rejects.toThrow('Training not found');
  });
});

describe('benchmark epoch ancestry', () => {
  it('checks access to the live training reached through an epoch before populating', async () => {
    const doc = benchmarkDoc({ training_id: null, training_uuid: undefined, epoch_uuid: 'e1', populate: vi.fn() });
    mockedBenchmark.findOne.mockResolvedValue(doc);
    vi.mocked(Epoch.findOne).mockResolvedValueOnce({ trainingId: 't2' } as never);
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t2'));
    await expect(getBenchmarkById('b1', 'u1')).resolves.toBe(doc);
    expect(Epoch.findOne).toHaveBeenCalledWith({ epoch_uuid: 'e1', deletedAt: null });
    expect(mockedTraining.findOne).toHaveBeenCalledWith({ _id: 't2', deletedAt: null });
    expect(mockedCheckAccess).toHaveBeenCalledWith('u1', 'p1');
  });
  it('refuses an epoch whose training has disappeared', async () => {
    mockedBenchmark.findOne.mockResolvedValue(
      benchmarkDoc({ training_id: null, training_uuid: undefined, epoch_uuid: 'e1' })
    );
    vi.mocked(Epoch.findOne).mockResolvedValueOnce({ trainingId: 't2' } as never);
    mockedTraining.findOne.mockResolvedValue(null);
    await expect(getBenchmarkById('b1', 'u1')).rejects.toThrow('Training not found');
  });
  it('refuses a missing epoch rather than treating the benchmark as standalone', async () => {
    mockedBenchmark.findOne.mockResolvedValue(
      benchmarkDoc({ training_id: null, training_uuid: undefined, epoch_uuid: 'e1' })
    );
    vi.mocked(Epoch.findOne).mockResolvedValueOnce(null);
    await expect(getBenchmarkById('b1', 'u1')).rejects.toThrow('Epoch not found');
  });
});

describe('createBenchmark / uploadBenchmark', () => {
  const body: CreateBenchmarkBody = {
    timestamp: new Date('2026-01-01'),
    system_info: { cpu_count: 8, cpu_count_logical: 16, memory_total_gb: 32 },
    results: [],
    training_uuid: 'uuid-t1'
  };

  beforeEach(() => {
    mockedBenchmark.mockImplementation(function (data: AnyDoc) {
      return {
        ...data,
        save: vi.fn().mockResolvedValue({ ...data, _id: 'new' })
      };
    });
  });

  it('links the benchmark to its training and touches its timestamp', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findOneAndUpdate.mockResolvedValue({});

    const result = (await createBenchmark(body, undefined, 'u1')) as AnyDoc;

    expect(mockedBenchmark.mock.calls[0][0].training_id).toEqual(
      expect.objectContaining({ toString: expect.any(Function) })
    );
    expect(mockedTraining.findOneAndUpdate).toHaveBeenCalled();
    expect(result._id).toBe('new');
  });

  it('403s when the token scope does not cover the training', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTokenScope.mockReturnValue(false);

    await expect(createBenchmark(body, 'p-other', 'u1')).rejects.toThrow('Access denied');
  });

  it('rejects an unresolved training uuid', async () => {
    mockedTraining.findOne.mockResolvedValue(null);

    await expect(uploadBenchmark(body, undefined, 'u1')).rejects.toThrow();
    expect(mockedBenchmark).not.toHaveBeenCalled();
  });

  it('fails closed on training lookup errors', async () => {
    mockedTraining.findOne.mockRejectedValue(new Error('db down'));

    await expect(createBenchmark(body, undefined, 'u1')).rejects.toThrow('db down');
    expect(mockedBenchmark).not.toHaveBeenCalled();
  });

  it('survives a failed training timestamp update', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findOneAndUpdate.mockRejectedValue(new Error('later'));

    await expect(createBenchmark(body, undefined, 'u1')).resolves.toBeDefined();
  });

  it('skips training resolution entirely without a training_uuid', async () => {
    await createBenchmark({ ...body, training_uuid: undefined }, undefined, 'u1');

    expect(mockedTraining.findOne).not.toHaveBeenCalled();
    expect(mockedBenchmark.mock.calls[0][0].training_id).toBeNull();
  });
});

describe('getBenchmarkStats', () => {
  it('averages result metrics across visible benchmarks', async () => {
    mockedVisibleTrainings.mockResolvedValue(['t1']);
    mockedBenchmark.find.mockResolvedValue([
      benchmarkDoc({
        results: [
          { total_parameters: 100, flops_giga: 10, fps: 30, gpu_memory_mean_mb: 500 },
          { total_parameters: 300, flops_giga: 20, fps: 60, ram_memory_mean_mb: 100 }
        ]
      })
    ]);

    const stats = await getBenchmarkStats(undefined, 'u1');

    expect(stats.totalBenchmarks).toBe(1);
    expect(stats.totalResults).toBe(2);
    expect(stats.avgParameters).toBe(200);
    expect(stats.avgFlops).toBe(15);
    expect(stats.avgFps).toBe(45);
    expect(stats.avgMemoryUsage).toBe(300);
  });

  it('handles zero benchmarks', async () => {
    mockedVisibleTrainings.mockResolvedValue([]);
    mockedBenchmark.find.mockResolvedValue([]);

    const stats = await getBenchmarkStats(undefined, undefined);

    expect(stats).toEqual({
      totalBenchmarks: 0,
      totalResults: 0,
      avgParameters: 0,
      avgFlops: 0,
      avgFps: 0,
      avgMemoryUsage: 0
    });
  });

  it('403s for a training in an invisible project', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(getBenchmarkStats('uuid-t1', 'u1')).rejects.toThrow();
  });

  it('filters by training_uuid when accessible', async () => {
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedBenchmark.find.mockResolvedValue([]);

    await getBenchmarkStats('uuid-t1', 'u1');

    expect(mockedBenchmark.find).toHaveBeenCalledWith({ deletedAt: null, training_uuid: 'uuid-t1' });
  });
});

describe('updateBenchmark', () => {
  it('404s when missing', async () => {
    mockedBenchmark.findOne.mockResolvedValue(null);

    await expect(updateBenchmark('b1', {}, 'u1', undefined)).rejects.toThrow('Benchmark not found');
  });

  it('403s when the current training is out of reach', async () => {
    vi.mocked(assertResourceWrite).mockRejectedValueOnce(new ForbiddenError());
    mockedBenchmark.findOne.mockResolvedValue(benchmarkDoc());
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedCheckAccess.mockResolvedValue(false);

    await expect(updateBenchmark('b1', {}, 'u1', undefined)).rejects.toThrow();
  });

  it('applies partial updates and relinks to a new training', async () => {
    const doc = benchmarkDoc();
    mockedBenchmark.findOne.mockResolvedValue(doc);
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    const newTraining = trainingDoc('t2');
    mockedTraining.findOne
      .mockResolvedValueOnce(trainingDoc('t1'))
      .mockResolvedValueOnce(trainingDoc('t1'))
      .mockResolvedValue(newTraining);

    await updateBenchmark(
      'b1',
      {
        timestamp: new Date('2026-06-01'),
        system_info: { gpu_name: 'A100' },
        results: [{ fps: 30 }],
        training_uuid: 'uuid-t2',
        epoch_uuid: 'e9',
        epoch: 9
      },
      'u1',
      undefined
    );

    expect(doc.timestamp).toEqual(new Date('2026-06-01'));
    expect(doc.system_info).toEqual({ cpu_count: 8, gpu_name: 'A100' });
    expect(doc.results).toEqual([{ fps: 30 }]);
    expect(doc.training_id).toBe(newTraining._id);
    expect(doc.epoch_uuid).toBe('e9');
    expect(doc.epoch).toBe(9);
    expect(doc.save).toHaveBeenCalled();
  });

  it('403s when the new training is outside the token scope', async () => {
    const doc = benchmarkDoc({ training_id: null });
    mockedBenchmark.findOne.mockResolvedValue(doc);
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t2'));
    mockedTokenScope.mockReturnValue(false);

    await expect(updateBenchmark('b1', { training_uuid: 'uuid-t2' }, 'u1', 'p-token')).rejects.toThrow();
  });

  it('unlinks the training when training_uuid is cleared', async () => {
    const doc = benchmarkDoc({ training_id: 'old' });
    mockedBenchmark.findOne.mockResolvedValue(doc);
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));

    await updateBenchmark('b1', { training_uuid: '' }, 'u1', undefined);

    expect(doc.training_id).toBeNull();
  });

  it('rejects a failed parent lookup without saving', async () => {
    const doc = benchmarkDoc({ training_id: null });
    mockedBenchmark.findOne.mockResolvedValue(doc);
    mockedTraining.findOne.mockRejectedValue(new Error('db'));

    await expect(updateBenchmark('b1', { training_uuid: 'uuid-t2' }, 'u1', undefined)).rejects.toThrow('db');
    expect(doc.save).not.toHaveBeenCalled();
  });
});

describe('deleteBenchmark', () => {
  it('404s when missing', async () => {
    mockedBenchmark.findOne.mockResolvedValue(null);

    await expect(deleteBenchmark('b1', 'u1', undefined)).rejects.toThrow('Benchmark not found');
  });

  it('403s when the training is out of reach or scope', async () => {
    mockedBenchmark.findOne.mockResolvedValue(benchmarkDoc());
    mockedTraining.findOne.mockResolvedValue(trainingDoc('t1'));
    mockedTraining.findById.mockResolvedValue(trainingDoc('t1'));
    mockedTokenScope.mockReturnValue(false);

    await expect(deleteBenchmark('b1', 'u1', 'p-token')).rejects.toThrow();
  });

  it('soft-deletes', async () => {
    const doc = benchmarkDoc({ training_id: null });
    mockedBenchmark.findOne.mockResolvedValue(doc);

    await deleteBenchmark('b1', 'u1', undefined);

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });
});
