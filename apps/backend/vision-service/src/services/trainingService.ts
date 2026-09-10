import { assertResourceWrite, requireActor } from './writeAccessService';
import { getEditableProjectIds, resolveProject } from './projectAccessService';
import { randomUUID as uuidv4 } from 'crypto';
import { QueryFilter, Types } from 'mongoose';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { BadRequestError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import Training, { ITraining } from '../models/Training';
import Epoch, { IEpoch } from '../models/Epoch';
import TestResult from '../models/TestResult';
import Benchmark, { IBenchmark } from '../models/Benchmark';
import Comparison from '../models/Comparison';
import { testResultService } from './testResultService';
import { checkProjectAccess, createProjectAccessChecker, getVisibleProjectIds } from './projectAccessService';
import { costOf, costingByProject, costingFor } from './costingService';

interface TrainingMetrics {
  totalTime: number;
  epochCount: number;
  maxEpoch: number;
  lastEpochTimestamp: Date | null;
  cpuCost?: number;
  gpuCost?: number;
  totalCost?: number;
  /** ISO code the costs above are denominated in */
  currency?: string;
}

interface CurrencyCostTotal {
  currency: string;
  totalCpuCost: number;
  totalGpuCost: number;
  totalCost: number;
}
export type TrainingWithMetrics = Record<string, unknown> & { metrics: TrainingMetrics };
type TrainingComparisonItem = Awaited<ReturnType<typeof testResultService.getAggregatedTestResultsByTraining>>['comparison'][number];
// benchmark.training_id is declared as a plain ObjectId, but these queries populate it
// with `name`/`uuid` — Mongoose's static types don't reflect .populate() shape changes.
type PopulatedTrainingRef = Pick<ITraining, '_id' | 'name' | 'uuid'>;

interface PaginationOptions {
  page?: number;
  limit?: number;
}

interface TrainingFilters {
  search?: string;
  status?: string;
  datasetId?: string;
  projectId?: string;
  tags?: string[];
}

interface CreateTrainingData {
  name: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  projectId?: string;
  status?: string;
  tags?: string | string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
  uuid?: string;
}

interface UpdateTrainingData {
  name?: string;
  description?: string;
  datasetId?: string;
  configId?: string;
  status?: string;
  tags?: string | string[];
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * About `n` items, evenly spaced, always keeping the first and the last.
 *
 * The ends are kept because they are the two points a question about a curve is
 * usually actually about — where it started and where it got to.
 */
function evenlySpaced<T>(items: T[], n: number): T[] {
  if (items.length <= n || n < 2) return items;

  const step = (items.length - 1) / (n - 1);
  const picked: T[] = [];
  for (let i = 0; i < n; i += 1) picked.push(items[Math.round(i * step)]);
  return picked;
}

export const trainingService = {
  checkProjectAccess,

  async getTrainings(userId: string | undefined, filters: TrainingFilters, pagination: PaginationOptions) {
    const { page = 1, limit = 30 } = pagination;
    const { search, status, datasetId, projectId, tags } = filters;

    const query: QueryFilter<ITraining> = { deletedAt: null };
    if (tokenProjectId()) query.$and = [{ projectId: { $in: await getVisibleProjectIds(userId) } }];

    // Search functionality
    if (search) {
      query.$text = { $search: search };
    }

    // Filter by status
    if (status) {
      query.status = status as ITraining['status'];
    }

    // Filter by dataset
    if (datasetId) {
      query.datasetId = datasetId;
    }

    // Filter by project
    if (projectId) {
      const project = await resolveProject(projectId);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check access to the project
      const hasAccess = await this.checkProjectAccess(userId, project._id.toString());
      if (!hasAccess) {
        throw new ForbiddenError('Access denied to project');
      }

      query.projectId = project._id.toString();
    } else {
      const projectIds = await getVisibleProjectIds(userId);
      query.$or = [
        { projectId: { $in: projectIds } },
        { projectId: { $exists: false } },
        { projectId: null }
      ];
    }

    // Filter by tags
    if (tags && tags.length > 0) {
      query.tags = tags.length === 1 ? { $in: tags } : { $all: tags };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [fetchedTrainings, total] = await Promise.all([
      Training.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Training.countDocuments(query)
    ]);

    const trainings: ITraining[] = fetchedTrainings;
    let trainingsOutput: Array<ITraining | TrainingWithMetrics> = trainings;

    // Get metrics using aggregation for better performance
    if (trainings.length > 0) {
      const trainingIds = trainings.map(t => t._id);
      const metricsAggregation = await Training.aggregate([
        { $match: { _id: { $in: trainingIds } } },
        {
          $lookup: {
            from: 'training_epoches',
            let: { trainingId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } }
            ],
            as: 'epochs'
          }
        },
        {
          $addFields: {
            metrics: {
              totalTime: { $ifNull: [{ $sum: '$epochs.epoch_time' }, 0] },
              epochCount: { $size: '$epochs' },
              maxEpoch: { $ifNull: [{ $max: '$epochs.epoch' }, 0] },
              lastEpochTimestamp: { $ifNull: [{ $max: '$epochs.timestamp' }, null] }
            }
          }
        },
        {
          $project: {
            _id: 1,
            metrics: 1
          }
        }
      ]);

      // Create a map of metrics by training ID
      const metricsMap = new Map<string, TrainingMetrics>();
      metricsAggregation.forEach(item => {
        metricsMap.set(item._id.toString(), item.metrics);
      });

      // A page can span projects, and a training need not belong to one at all,
      // so costs are applied per row at that project's rates rather than by one
      // constant baked into the pipeline.
      const byProject = await costingByProject(trainings.map(t => t.projectId));

      trainingsOutput = trainings.map(training => {
        const base = metricsMap.get(training._id.toString());
        const cost = costOf(base?.totalTime ?? 0, costingFor(byProject, training.projectId));
        return {
          ...training.toObject(),
          metrics: {
            totalTime: base?.totalTime ?? 0,
            epochCount: base?.epochCount ?? 0,
            maxEpoch: base?.maxEpoch ?? 0,
            lastEpochTimestamp: base?.lastEpochTimestamp ?? null,
            // absent when the training's project has not priced its hardware
            cpuCost: cost.cpuCost,
            gpuCost: cost.gpuCost,
            totalCost: cost.totalCost,
            currency: cost.currency
          }
        };
      });
    }

    return {
      trainings: trainingsOutput,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    };
  },

  async getTrainingById(id: string, userId: string | undefined) {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    return training;
  },

  async getTrainingByUuid(uuid: string, userId: string | undefined) {
    const training = await Training.findOne({ uuid, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    return training;
  },

  async getTrainingWithEpochs(
    id: string,
    userId: string | undefined,
    sortBy: string,
    order: 1 | -1,
    sample?: number
  ) {
    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const query = { trainingId: id, deletedAt: null };
    const sort = { [sortBy]: order } as Record<string, 1 | -1>;

    if (sample === undefined) {
      const epochs = await Epoch.find(query).sort(sort);
      return { training, epochs, totalEpochs: epochs.length };
    }

    // Ids first, then only the documents actually wanted. Slicing a full read
    // would save the caller the transfer but not this service the work of
    // loading and serializing every epoch, which is the larger half of it.
    // Keyed on `_id` rather than epoch number so it stays correct whatever the
    // rows are sorted by.
    const ids = await Epoch.find(query).select('_id').sort(sort);
    const picked = evenlySpaced(ids, sample).map(row => row._id);

    const epochs = await Epoch.find({ ...query, _id: { $in: picked } }).sort(sort);
    return { training, epochs, totalEpochs: ids.length };
  },

  async createTraining(userId: string, data: CreateTrainingData) {
    if (tokenProjectId() && !(await this.checkProjectAccess(userId, data.projectId))) {
      throw new ForbiddenError('Access denied to project');
    }
    const { 
      name, 
      description, 
      datasetId,
      configId,
      projectId,
      status = 'pending',
      tags,
      startTime,
      endTime,
      metadata 
    } = data;

    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Training name is required');
    }

    const ownerId = requireActor(userId);
    let resolvedProjectId: string | undefined;
    if (projectId) {
      const project = await resolveProject(projectId);
      if (!project) throw new ForbiddenError('Access denied to project');
      resolvedProjectId = project._id.toString();
    }
    await assertResourceWrite({ projectId: resolvedProjectId, ownerId }, userId);

    // Generate UUID if not provided
    const uuid = data.uuid || uuidv4();

    const training = new Training({
      ownerId,
      uuid,
      name: name.trim(),
      description: description?.trim(),
      datasetId,
      configId,
      projectId: resolvedProjectId,
      status,
      tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
      startTime,
      endTime,
      metadata
    });

    const savedTraining = await training.save();
    return savedTraining;
  },

  async updateTraining(id: string, userId: string, data: UpdateTrainingData) {
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestError('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    await assertResourceWrite(training, userId);

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const {
      name, 
      description, 
      datasetId,
      configId,
      status,
      tags,
      startTime,
      endTime,
      metadata 
    } = data;

    if (name !== undefined) training.name = name.trim();
    if (description !== undefined) training.description = description?.trim();
    if (datasetId !== undefined) training.datasetId = datasetId;
    if (configId !== undefined) training.configId = configId;
    if (status !== undefined) training.status = status as ITraining['status'];
    if (tags !== undefined) training.tags = tags ? (Array.isArray(tags) ? tags : [tags]) : [];
    if (startTime !== undefined) training.startTime = startTime;
    if (endTime !== undefined) training.endTime = endTime;
    if (metadata !== undefined) training.metadata = metadata;

    const updatedTraining = await training.save();
    return updatedTraining;
  },

  async deleteTraining(id: string, userId: string) {
    // Validate ID format
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestError('Invalid training ID format');
    }

    const training = await Training.findOne({ _id: id, deletedAt: null });

    if (!training) {
      throw new NotFoundError('Training not found');
    }

    await assertResourceWrite(training, userId);

    // Check project access
    const hasAccess = await this.checkProjectAccess(userId, training.projectId);
    if (!hasAccess) {
      throw new ForbiddenError();
    }

    const now = new Date();
    
    // Mark training as deleted
    training.deletedAt = now;
    await training.save();

    // Mark all epochs of this training as deleted
    await Epoch.updateMany({ trainingId: id }, { deletedAt: now });

    // Get all epoch UUIDs for this training to mark test results as deleted
    const trainingEpochs = await Epoch.find({ trainingId: id }, 'epoch_uuid');
    const epochUuids = trainingEpochs.map(e => e.epoch_uuid);

    if (epochUuids.length > 0) {
      // Mark all test results for these epochs as deleted
      await TestResult.updateMany({ epoch_uuid: { $in: epochUuids } }, { deletedAt: now });
    }

    // Only edit comparisons this principal can write. Foreign references remain
    // historical references; deleting a training does not grant their ownership.
    const editableProjects = await getEditableProjectIds(userId);
    await Comparison.updateMany(
      { itemIds: id, $or: [
        { projectId: { $in: editableProjects } },
        ...(!tokenProjectId() ? [{ projectId: null, ownerId: userId }] : [])
      ] },
      { $pull: { itemIds: id }, updatedAt: now }
    );

    return true;
  },

  async getTrainingStats(userId: string | undefined, filters: TrainingFilters) {
    const { status, datasetId, tags, projectId } = filters;

    const matchQuery: QueryFilter<ITraining> = { deletedAt: null };
    if (tokenProjectId()) matchQuery.$and = [{ projectId: { $in: await getVisibleProjectIds(userId) } }];

    // Filter by status if provided
    if (status) {
      matchQuery.status = status as ITraining['status'];
    }

    // Filter by dataset if provided
    if (datasetId) {
      matchQuery.datasetId = datasetId;
    }

    // Filter by project if provided
    if (projectId) {
      if (!(await this.checkProjectAccess(userId, projectId))) {
        throw new ForbiddenError('Access denied to project');
      }
      const project = await resolveProject(projectId);
      if (!project) throw new NotFoundError('Project not found');
      matchQuery.projectId = project._id.toString();
    } else {
      // No project filter given: scope to trainings the caller can actually
      // see — otherwise these aggregate stats are computed across every
      // project regardless of privacy.
      const visibleProjectIds = await getVisibleProjectIds(userId);
      matchQuery.$or = [
        { projectId: { $in: visibleProjectIds } },
        { projectId: { $exists: false } }
      ];
    }

    // Filter by tags if provided
    if (tags && tags.length > 0) {
      matchQuery.tags = tags.length === 1 ? { $in: tags } : { $all: tags };
    }

    // Use aggregation pipeline for better performance
    const aggregationPipeline = [
      // Match trainings based on filters
      { $match: matchQuery },
      // Lookup epochs for each training
      {
        $lookup: {
          from: 'training_epoches',
          let: { trainingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } }
          ],
          as: 'epochs'
        }
      },
      // Add computed fields
      {
        $addFields: {
          trainingTime: { $ifNull: [{ $sum: '$epochs.epoch_time' }, 0] },
          epochCount: { $size: '$epochs' }
        }
      },
      // Group to calculate totals
      {
        $group: {
          _id: null,
          totalTrainings: { $sum: 1 },
          totalTime: { $sum: '$trainingTime' },
          totalEpochs: { $sum: '$epochCount' }
        }
      },
      // Costs are applied in JS below, per project.
      {
        $addFields: {
          totalHours: { $divide: ['$totalTime', 3600] },
          avgEpochTime: { $cond: { if: { $gt: ['$totalEpochs', 0] }, then: { $divide: ['$totalTime', '$totalEpochs'] }, else: 0 } }
        }
      }
    ];

    const result = await Training.aggregate(aggregationPipeline);
    const stats = result[0] || {
      totalTrainings: 0,
      totalTime: 0,
      totalEpochs: 0,
      avgEpochTime: 0
    };

    // These totals may span projects with different rates, so the time is summed
    // per project and each project's own rates applied to its share.
    const perProject = await Training.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'training_epoches',
          let: { trainingId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] }, $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }] } },
            { $group: { _id: null, time: { $sum: '$epoch_time' } } }
          ],
          as: 'epochStats'
        }
      },
      {
        $group: {
          _id: '$projectId',
          totalTrainings: { $sum: 1 },
          totalTime: { $sum: { $ifNull: [{ $arrayElemAt: ['$epochStats.time', 0] }, 0] } }
        }
      }
    ]);

    const byProject = await costingByProject(perProject.map(row => row._id));
    const totalsByCurrency = new Map<string, CurrencyCostTotal>();
    const costCoverage = { pricedTrainings: 0, unpricedTrainings: 0, pricedTime: 0, unpricedTime: 0 };
    for (const row of perProject) {
      const rates = costingFor(byProject, row._id);
      if (!rates) {
        costCoverage.unpricedTrainings += row.totalTrainings;
        costCoverage.unpricedTime += row.totalTime;
        continue;
      }
      costCoverage.pricedTrainings += row.totalTrainings;
      costCoverage.pricedTime += row.totalTime;
      const cost = costOf(row.totalTime, rates);
      const subtotal = totalsByCurrency.get(rates.currency) ?? {
        currency: rates.currency, totalCpuCost: 0, totalGpuCost: 0, totalCost: 0,
      };
      subtotal.totalCpuCost += cost.cpuCost!;
      subtotal.totalGpuCost += cost.gpuCost!;
      subtotal.totalCost += cost.totalCost!;
      totalsByCurrency.set(rates.currency, subtotal);
    }
    const costTotalsByCurrency = [...totalsByCurrency.values()]
      .sort((a, b) => a.currency.localeCompare(b.currency));

    // Retain scalar fields for single-currency clients only. These are estimates
    // at current project rates; no exchange rates or historical billing implied.
    const totals = costTotalsByCurrency.length === 1 ? costTotalsByCurrency[0] : {};

    return {
      ...stats,
      ...totals,
      costTotalsByCurrency,
      costCoverage,
      filters: {
        status: status || null,
        datasetId: datasetId || null,
        projectId: projectId || null
      }
    };
  },

  async compareTrainings(userId: string | undefined, trainingIds: string[]) {
    if (trainingIds.length > 30) {
      throw new BadRequestError('Maximum 30 trainings can be compared at once');
    }

    // Fetch trainings, dropping any whose project isn't visible to the
    // caller — comparing arbitrary ids shouldn't leak private-project data.
    const foundTrainings = await Training.find({ _id: { $in: trainingIds }, deletedAt: null });
    // Memoized per request: up to 30 trainings usually span far fewer projects.
    const hasProjectAccess = createProjectAccessChecker(userId);
    const trainings = [];
    for (const training of foundTrainings) {
      if (await hasProjectAccess(training.projectId)) {
        trainings.push(training);
      }
    }
    const foundTrainingIds = trainings.map(t => t._id.toString());
    const epochs = await Epoch.find({ trainingId: { $in: foundTrainingIds }, deletedAt: null })
      .sort({ trainingId: 1, epoch: 1 });

    // Get all epoch UUIDs for fetching benchmarks
    const epochUuids = epochs.map(e => e.epoch_uuid);

    // Get aggregated test results for these trainings
    const aggregatedTestResults = await testResultService.getAggregatedTestResultsByTraining(userId, foundTrainingIds);

    // Get all benchmarks for these trainings
    const benchmarks = await Benchmark.find({ 
      $or: [
        { training_id: { $in: foundTrainingIds } },
        { epoch_uuid: { $in: epochUuids } }
      ], 
      deletedAt: null 
    }).populate('training_id', 'name uuid');

    // Group epochs by training ID
    const epochsByTraining: Record<string, IEpoch[]> = epochs.reduce((acc, epoch) => {
      const trainingId = epoch.trainingId.toString();
      if (!acc[trainingId]) {
        acc[trainingId] = [];
      }
      acc[trainingId].push(epoch);
      return acc;
    }, {} as Record<string, IEpoch[]>);

    // Group benchmarks by training ID
    const benchmarksByTraining: Record<string, IBenchmark[]> = benchmarks.reduce((acc, benchmark) => {
      let trainingId: string | null = null;
      const populatedTrainingRef = benchmark.training_id as unknown as PopulatedTrainingRef | Types.ObjectId | string | null;
      if (populatedTrainingRef && typeof populatedTrainingRef === 'object' && '_id' in populatedTrainingRef) {
        trainingId = populatedTrainingRef._id.toString();
      } else if (typeof benchmark.training_id === 'string') {
        trainingId = benchmark.training_id;
      } else {
        // Try to find via epoch_uuid
        const epoch = epochs.find(e => e.epoch_uuid === benchmark.epoch_uuid);
        if (epoch) {
          trainingId = epoch.trainingId.toString();
        }
      }

      if (trainingId) {
        if (!acc[trainingId]) {
          acc[trainingId] = [];
        }
        acc[trainingId].push(benchmark);
      }
      return acc;
    }, {} as Record<string, IBenchmark[]>);

    // Compared trainings often come from different projects, so each one's costs
    // use its own project's rates.
    const byProject = await costingByProject(trainings.map(t => t.projectId));

    // Calculate comparison data for each training
    const comparisonData = trainings.map(training => {
      const trainingId = training._id.toString();
      const trainingEpochs = epochsByTraining[trainingId] || [];
      const trainingAggregatedResults: TrainingComparisonItem | undefined = aggregatedTestResults.comparison.find((item) =>
        item.training._id.toString() === trainingId
      );
      let trainingBenchmarks = benchmarksByTraining[trainingId] || [];
      // if there are multiple benchmarks keep only the most recent one (by timestamp)
      if (trainingBenchmarks.length > 1) {
        trainingBenchmarks = trainingBenchmarks.slice();
        trainingBenchmarks.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        trainingBenchmarks = [trainingBenchmarks[trainingBenchmarks.length - 1]];
      }
      const lastEpoch = trainingEpochs.length > 0 ? trainingEpochs[trainingEpochs.length - 1] : null;

      // Calculate training metrics
      const totalTime = trainingEpochs.reduce((sum, epoch) => sum + (epoch.epoch_time || 0), 0);
      const avgEpochTime = trainingEpochs.length > 0 ? totalTime / trainingEpochs.length : 0;

      const { totalHours, cpuCost, gpuCost, totalCost, currency } = costOf(
        totalTime,
        costingFor(byProject, training.projectId)
      );

      return {
        training: {
          _id: training._id,
          name: training.name,
          description: training.description,
          status: training.status,
          createdAt: training.createdAt,
          updatedAt: training.updatedAt
        },
        metrics: {
          totalEpochs: trainingEpochs.length,
          totalTime,
          avgEpochTime,
          maxEpochTime: trainingEpochs.length > 0 ? Math.max(...trainingEpochs.map((e) => e.epoch_time || 0)) : 0,
          cost: {
            totalHours,
            cpuCost,
            gpuCost,
            totalCost,
            currency
          }
        },
        lastEpoch: lastEpoch ? {
          epoch: lastEpoch.epoch,
          results: lastEpoch.results,
          timestamp: lastEpoch.timestamp
        } : null,
        epochs: trainingEpochs.map((epoch) => ({
          epoch: epoch.epoch,
          results: epoch.results,
          epoch_time: epoch.epoch_time,
          timestamp: epoch.timestamp
        })),
        aggregatedTestResults: trainingAggregatedResults?.aggregatedResults || null,
        testResultsCount: trainingAggregatedResults?.testResultsCount || 0,
        benchmarks: trainingBenchmarks
      };
    });

    return {
      comparison: comparisonData,
      summary: {
        totalTrainings: trainings.length,
        trainingsWithEpochs: comparisonData.filter(c => c.epochs.length > 0).length,
        trainingsWithTestResults: comparisonData.filter(c => c.aggregatedTestResults !== null).length,
        trainingsWithBenchmarks: comparisonData.filter(c => c.benchmarks.length > 0).length
      }
    };
  }
};
