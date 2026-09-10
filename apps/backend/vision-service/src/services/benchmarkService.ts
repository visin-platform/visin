import { assertResourceWrite, requireActor, assertEpochWrite } from './writeAccessService';
import { QueryFilter } from 'mongoose';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { ForbiddenError, NotFoundError, logger } from '@visin/backend-core';
import Benchmark, { IBenchmark } from '../models/Benchmark';
import Epoch from '../models/Epoch';
import Training, { ITraining } from '../models/Training';
import { checkProjectAccess, getVisibleTrainingIds, isWithinTokenScope } from './projectAccessService';
import type { GetBenchmarksQuery, CreateBenchmarkBody, UpdateBenchmarkBody } from '../validation/benchmarkSchemas';

interface BenchmarksPage {
  benchmarks: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export const getBenchmarks = async (
  filters: GetBenchmarksQuery,
  userId: string | undefined
): Promise<BenchmarksPage> => {
  const { training_uuid, projectId, sortBy, order } = filters;
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;

  const query: QueryFilter<IBenchmark> = { deletedAt: null };
  if (tokenProjectId()) query.$and = [{ training_id: { $in: await getVisibleTrainingIds(userId) } }];

  // Filter by projectId if provided
  if (projectId) {
    if (!(await checkProjectAccess(userId, projectId))) {
      throw new ForbiddenError();
    }

    const trainings = await Training.find({ projectId, deletedAt: null });
    if (trainings.length === 0) {
      return { benchmarks: [], pagination: { page, limit, total: 0, pages: 0 } };
    }

    const trainingIds = trainings.map((t) => t._id.toString());
    query.training_id = { $in: trainingIds };
  }
  // Filter by training UUID if provided
  else if (training_uuid) {
    const training = await Training.findOne({ uuid: training_uuid, deletedAt: null });
    if (!training) throw new NotFoundError('Training not found');
    if (!(await checkProjectAccess(userId, training.projectId))) {
      throw new ForbiddenError();
    }
    query.training_uuid = training_uuid;
  }
  // No filter given: scope to trainings the caller can actually see, plus
  // benchmarks with no training at all (standalone hardware benchmarks) —
  // otherwise this returns every project's benchmarks regardless of privacy.
  else {
    const visibleTrainingIds = await getVisibleTrainingIds(userId);
    query.$or = [
      { training_id: { $in: visibleTrainingIds } },
      { training_id: null, training_uuid: null, epoch_uuid: null }
    ];
  }

  const skip = (page - 1) * limit;

  const [benchmarks, total] = await Promise.all([
    Benchmark.find(query)
      .sort({ [sortBy]: order })
      .skip(skip)
      .limit(limit),
    Benchmark.countDocuments(query)
  ]);

  // Get unique training IDs from benchmarks
  const trainingIds = [...new Set(benchmarks.map((b) => b.training_id).filter((id) => id != null))];

  // Fetch training data if we have training IDs
  let trainingMap = new Map();
  if (trainingIds.length > 0) {
    try {
      const trainings = await Training.find({
        _id: { $in: trainingIds },
        deletedAt: null
      }).select('name uuid');

      trainingMap = new Map(trainings.map((training) => [training._id.toString(), training]));
    } catch (populateError) {
      logger.warn('Failed to fetch training data for benchmarks', { error: (populateError as Error).message });
      // Continue without training data
    }
  }

  const benchmarksWithTraining = benchmarks.map((benchmark) => ({
    ...benchmark.toObject(),
    training_id: benchmark.training_id ? trainingMap.get(benchmark.training_id.toString()) || null : null
  }));

  return {
    benchmarks: benchmarksWithTraining,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
};

export const getBenchmarkById = async (id: string, userId: string | undefined): Promise<IBenchmark> => {
  const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });
  if (!benchmark) throw new NotFoundError('Benchmark not found');

  // Resolve the raw reference before population can turn a missing parent into
  // null. Every supplied reference must lead to the same live, readable parent.
  let training: ITraining | null = null;
  const parents: ITraining[] = [];
  if (benchmark.training_id) {
    training = await Training.findOne({ _id: benchmark.training_id, deletedAt: null });
    if (!training) throw new NotFoundError('Training not found');
    parents.push(training);
  }
  if (benchmark.training_uuid) {
    training = await Training.findOne({ uuid: benchmark.training_uuid, deletedAt: null });
    if (!training) throw new NotFoundError('Training not found');
    parents.push(training);
  }
  if (benchmark.epoch_uuid) {
    const epoch = await Epoch.findOne({ epoch_uuid: benchmark.epoch_uuid, deletedAt: null });
    if (!epoch) throw new NotFoundError('Epoch not found');
    training = await Training.findOne({ _id: epoch.trainingId, deletedAt: null });
    if (!training) throw new NotFoundError('Training not found');
    parents.push(training);
  }
  if (
    parents.some((parent) => parent._id.toString() !== training!._id.toString()) ||
    !(await checkProjectAccess(userId, training?.projectId))
  )
    throw new ForbiddenError();
  await benchmark.populate('training_id', 'name uuid projectId');

  return benchmark;
};

export async function assertBenchmarkWrite(
  reference: {
    training_uuid?: string;
    epoch_uuid?: string;
    training_id?: IBenchmark['training_id'];
    ownerId?: string;
    deletedAt?: Date;
  },
  userId?: string,
  reqProjectId?: string
) {
  let training: ITraining | null = null;
  if (reference.training_id) {
    training = await Training.findOne({ _id: reference.training_id, deletedAt: null });
    await assertResourceWrite(training, userId);
  }
  if (reference.training_uuid) {
    const byUuid = await Training.findOne({ uuid: reference.training_uuid, deletedAt: null });
    await assertResourceWrite(byUuid, userId);
    if (training && training._id.toString() !== byUuid!._id.toString())
      throw new ForbiddenError('Conflicting benchmark parents');
    training = byUuid;
  }
  if (reference.epoch_uuid) {
    const epoch = await assertEpochWrite(reference.epoch_uuid, userId, reqProjectId);
    const byEpoch = await Training.findOne({ _id: epoch.trainingId, deletedAt: null });
    if (training && training._id.toString() !== byEpoch!._id.toString())
      throw new ForbiddenError('Conflicting benchmark parents');
    training = byEpoch;
  }
  if (!isWithinTokenScope(reqProjectId, training?.projectId)) throw new ForbiddenError();
  await assertResourceWrite(training || reference, userId);
  return training;
}

async function saveBenchmark(
  data: CreateBenchmarkBody,
  reqProjectId: string | undefined,
  userId?: string
): Promise<IBenchmark> {
  const ownerId = requireActor(userId);
  const training = await assertBenchmarkWrite({ ...data, ownerId }, userId, reqProjectId);
  const training_id = training?._id ?? null;

  const benchmark = new Benchmark({
    ownerId,
    training_uuid: training?.uuid,
    training_id,
    epoch_uuid: data.epoch_uuid,
    epoch: data.epoch,
    timestamp: new Date(data.timestamp),
    system_info: data.system_info,
    results: data.results
  });

  const savedBenchmark = await benchmark.save();

  if (data.training_uuid) {
    try {
      await Training.findOneAndUpdate({ uuid: data.training_uuid, deletedAt: null }, { updatedAt: new Date() });
    } catch (updateError) {
      logger.warn('Failed to update training timestamp', { error: (updateError as Error).message });
      // Don't fail the request if timestamp update fails
    }
  }

  return savedBenchmark;
}

export const createBenchmark = (
  data: CreateBenchmarkBody,
  reqProjectId: string | undefined,
  userId?: string
): Promise<IBenchmark> => saveBenchmark(data, reqProjectId, userId);

export const uploadBenchmark = (
  data: CreateBenchmarkBody,
  reqProjectId: string | undefined,
  userId?: string
): Promise<IBenchmark> => saveBenchmark(data, reqProjectId, userId);

interface BenchmarkStats {
  totalBenchmarks: number;
  totalResults: number;
  avgParameters: number;
  avgFlops: number;
  avgFps: number;
  avgMemoryUsage: number;
}

export const getBenchmarkStats = async (
  training_uuid: string | undefined,
  userId: string | undefined
): Promise<BenchmarkStats> => {
  const query: QueryFilter<IBenchmark> = { deletedAt: null };
  if (tokenProjectId()) query.$and = [{ training_id: { $in: await getVisibleTrainingIds(userId) } }];

  if (training_uuid) {
    const training = await Training.findOne({ uuid: training_uuid, deletedAt: null });
    if (!training) throw new NotFoundError('Training not found');
    if (!(await checkProjectAccess(userId, training.projectId))) {
      throw new ForbiddenError();
    }
    query.training_uuid = training_uuid;
  } else {
    // No filter given: scope to trainings the caller can actually see, plus
    // benchmarks with no training at all — otherwise these aggregate stats
    // are computed across every project's benchmarks regardless of privacy.
    const visibleTrainingIds = await getVisibleTrainingIds(userId);
    query.$or = [
      { training_id: { $in: visibleTrainingIds } },
      { training_id: null, training_uuid: null, epoch_uuid: null }
    ];
  }

  const benchmarks = await Benchmark.find(query);

  const stats: BenchmarkStats = {
    totalBenchmarks: benchmarks.length,
    totalResults: benchmarks.reduce((sum, b) => sum + b.results.length, 0),
    avgParameters: 0,
    avgFlops: 0,
    avgFps: 0,
    avgMemoryUsage: 0
  };

  if (benchmarks.length > 0) {
    let totalParameters = 0;
    let totalFlops = 0;
    let totalFps = 0;
    let totalMemory = 0;
    let resultCount = 0;

    benchmarks.forEach((benchmark) => {
      benchmark.results.forEach((result) => {
        if (result.total_parameters) {
          totalParameters += result.total_parameters;
          resultCount++;
        }
        if (result.flops_giga) totalFlops += result.flops_giga;
        if (result.fps) totalFps += result.fps;
        if (result.gpu_memory_mean_mb) totalMemory += result.gpu_memory_mean_mb;
        else if (result.ram_memory_mean_mb) totalMemory += result.ram_memory_mean_mb;
      });
    });

    if (resultCount > 0) {
      stats.avgParameters = totalParameters / resultCount;
      stats.avgFlops = totalFlops / resultCount;
      stats.avgFps = totalFps / resultCount;
      stats.avgMemoryUsage = totalMemory / resultCount;
    }
  }

  return stats;
};

export const updateBenchmark = async (
  id: string,
  updateData: UpdateBenchmarkBody,
  userId: string | undefined,
  reqProjectId: string | undefined
): Promise<IBenchmark> => {
  const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });

  if (!benchmark) {
    throw new NotFoundError('Benchmark not found');
  }

  await assertBenchmarkWrite(benchmark, userId, reqProjectId);
  const nextParent = await assertBenchmarkWrite(
    {
      ownerId: benchmark.ownerId,
      training_id: updateData.training_uuid !== undefined ? null : benchmark.training_id,
      training_uuid: updateData.training_uuid !== undefined ? updateData.training_uuid : benchmark.training_uuid,
      epoch_uuid: updateData.epoch_uuid !== undefined ? updateData.epoch_uuid : benchmark.epoch_uuid
    },
    userId,
    reqProjectId
  );

  if (updateData.timestamp) {
    benchmark.timestamp = new Date(updateData.timestamp);
  }
  if (updateData.system_info) {
    benchmark.system_info = { ...benchmark.system_info, ...updateData.system_info };
  }
  if (updateData.results) {
    benchmark.results = updateData.results as IBenchmark['results'];
  }
  benchmark.training_id = nextParent?._id ?? null;
  benchmark.training_uuid = nextParent?.uuid;
  if (updateData.epoch_uuid !== undefined) benchmark.epoch_uuid = updateData.epoch_uuid;
  if (updateData.epoch !== undefined) {
    benchmark.epoch = updateData.epoch;
  }

  return benchmark.save();
};

export const deleteBenchmark = async (
  id: string,
  userId: string | undefined,
  reqProjectId: string | undefined
): Promise<void> => {
  const benchmark = await Benchmark.findOne({ _id: id, deletedAt: null });

  if (!benchmark) {
    throw new NotFoundError('Benchmark not found');
  }

  await assertBenchmarkWrite(benchmark, userId, reqProjectId);

  benchmark.deletedAt = new Date();
  await benchmark.save();
};
