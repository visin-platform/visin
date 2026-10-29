import { QueryFilter, Types, isValidObjectId } from 'mongoose';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Training, { ITraining } from '../models/Training';
import Epoch from '../models/Epoch';
import Project from '../models/Project';
import { checkProjectAccess, getEditableProjectIds, getVisibleProjectIds, resolveProject } from './projectAccessService';
import { costOf, costingByProject, costingFor } from './costingService';
import EpochVisualization from '../models/EpochVisualization';
import { summarizeMetrics } from './trainingSummaryService';
import type { TrainingSortField } from '../validation/trainingSchemas';
import type { PaginationOptions, TrainingFilters } from './trainingTypes';

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

export type TrainingWithMetrics = Record<string, unknown> & { metrics: TrainingMetrics };

const COMPUTED_SORT_FIELDS = new Set<TrainingSortField>(['epochCount', 'totalTime', 'cpuCost', 'gpuCost', 'totalCost']);

/**
 * One page of training ids, ordered by a value computed per run: its epochs'
 * count or time, or that time priced at its project's rates. Every matching
 * run is measured, since any of them may belong on the page. A run whose
 * project has no rates has no cost and sorts after every priced one, either way.
 */
async function idsOrderedByMetric(
  query: QueryFilter<ITraining>,
  sortBy: TrainingSortField,
  order: 1 | -1,
  skip: number,
  limit: number
): Promise<Types.ObjectId[]> {
  const hours = { $divide: ['$totalTime', 3600] };
  const priced = { $and: [{ $isNumber: '$rates.cpuRatePerHour' }, { $isNumber: '$rates.gpuRatePerHour' }] };
  const cost = (rate: object) => ({ $cond: [priced, rate, null] });
  const rows = await Training.aggregate<{ _id: Types.ObjectId }>([
    { $match: query },
    {
      $lookup: {
        from: Epoch.collection.name,
        let: { trainingId: { $toString: '$_id' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', '$$trainingId'] }, deletedAt: null } },
          { $group: { _id: null, epochCount: { $sum: 1 }, totalTime: { $sum: { $ifNull: ['$epoch_time', 0] } } } }
        ],
        as: 'epochs'
      }
    },
    {
      $addFields: {
        epochCount: { $ifNull: [{ $first: '$epochs.epochCount' }, 0] },
        totalTime: { $ifNull: [{ $first: '$epochs.totalTime' }, 0] }
      }
    },
    ...(sortBy === 'epochCount' || sortBy === 'totalTime'
      ? []
      : [
          {
            $lookup: {
              from: Project.collection.name,
              let: { projectId: '$projectId' },
              pipeline: [
                { $match: { $expr: { $eq: [{ $toString: '$_id' }, '$$projectId'] } } },
                { $project: { _id: 0, costing: 1 } }
              ],
              as: 'project'
            }
          },
          { $addFields: { rates: { $first: '$project.costing' } } },
          {
            $addFields: {
              cpuCost: cost({ $multiply: [hours, '$rates.cpuRatePerHour'] }),
              gpuCost: cost({ $multiply: [hours, '$rates.gpuRatePerHour'] }),
              totalCost: cost({ $multiply: [hours, { $add: ['$rates.cpuRatePerHour', '$rates.gpuRatePerHour'] }] })
            }
          },
          { $addFields: { unpriced: { $cond: [priced, 0, 1] } } }
        ]),
    {
      $sort:
        sortBy === 'epochCount' || sortBy === 'totalTime'
          ? { [sortBy]: order, _id: order }
          : { unpriced: 1, [sortBy]: order, _id: order }
    },
    { $skip: skip },
    { $limit: limit },
    { $project: { _id: 1 } }
  ]);
  return rows.map((row) => row._id);
}

export async function getTrainings(userId: string | undefined, filters: TrainingFilters, pagination: PaginationOptions) {
  const { page = 1, limit = 30, sortBy = 'updatedAt', order = -1 } = pagination;
  const { search, status, datasetId, projectId, access, tags, excludeTags, ids } = filters;

  const query: QueryFilter<ITraining> = { deletedAt: null };
  if (tokenProjectId()) query.$and = [{ projectId: { $in: await getVisibleProjectIds(userId) } }];
  if (access === 'contribute') {
    query.$and = [...(query.$and ?? []), { projectId: { $in: await getEditableProjectIds(userId) } }];
  }

  // Search functionality
  if (search) {
    query.$text = { $search: search };
  }

  // Filter by status
  if (status) {
    query.status = status as ITraining['status'];
  }

  // Filter by dataset: a run that names it by id (`datasetId`, older runs) or by reference (`dataset.id`, new ones)
  if (datasetId) {
    query.$and = [...(query.$and ?? []), { $or: [{ datasetId }, { 'dataset.id': datasetId }] }];
  }

  // Filter by project
  if (projectId) {
    const project = await resolveProject(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Check access to the project
    const hasAccess = await checkProjectAccess(userId, project._id.toString());
    if (!hasAccess) {
      throw new ForbiddenError('Access denied to project');
    }

    query.projectId = project._id.toString();
  } else {
    query.projectId = { $in: await getVisibleProjectIds(userId) };
  }

  if (ids) {
    // As ObjectIds, so the same filter works in an aggregation, which does not cast.
    query._id = { $in: ids.filter((id) => isValidObjectId(id)).map((id) => new Types.ObjectId(id)) };
  }

  // Filter by tags: every wanted tag present, and none of the excluded ones.
  const tagFilter: { $in?: string[]; $all?: string[]; $nin?: string[] } = {};
  if (tags && tags.length > 0) {
    if (tags.length === 1) tagFilter.$in = tags;
    else tagFilter.$all = tags;
  }
  if (excludeTags && excludeTags.length > 0) {
    tagFilter.$nin = excludeTags;
  }
  if (Object.keys(tagFilter).length > 0) {
    query.tags = tagFilter;
  }

  const skip = (Number(page) - 1) * Number(limit);

  let fetchedTrainings: ITraining[];
  let total: number;
  if (COMPUTED_SORT_FIELDS.has(sortBy)) {
    const [pageIds, count] = await Promise.all([
      idsOrderedByMetric(query, sortBy, order, skip, Number(limit)),
      Training.countDocuments(query)
    ]);
    const byId = new Map<string, ITraining>(
      (await Training.find({ _id: { $in: pageIds } })).map((t) => [t._id.toString(), t])
    );
    fetchedTrainings = pageIds.flatMap((id) => byId.get(id.toString()) ?? []);
    total = count;
  } else {
    [fetchedTrainings, total] = await Promise.all([
      Training.find(query)
        .sort({ [sortBy]: order, _id: order })
        // Names sort as people read them: "b" before "C".
        .collation({ locale: 'en', strength: 2 })
        .skip(skip)
        .limit(Number(limit)),
      Training.countDocuments(query)
    ]);
  }

  const trainings: ITraining[] = fetchedTrainings;
  let trainingsOutput: Array<ITraining | TrainingWithMetrics> = trainings;

  // Get metrics using aggregation for better performance
  if (trainings.length > 0) {
    const trainingIds = trainings.map((t) => t._id);
    const metricsAggregation = await Training.aggregate([
      { $match: { _id: { $in: trainingIds } } },
      {
        $lookup: {
          from: 'training_epoches',
          let: { trainingId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] },
                $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
              }
            }
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
    metricsAggregation.forEach((item) => {
      metricsMap.set(item._id.toString(), item.metrics);
    });

    // A page can span projects, and a training need not belong to one at all,
    // so costs are applied per row at that project's rates rather than by one
    // constant baked into the pipeline.
    const byProject = await costingByProject(trainings.map((t) => t.projectId));

    trainingsOutput = trainings.map((training) => {
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

  // Dataset participants need the linked models, output kinds and best readings in one request.
  // The page was scoped above; only those runs' live epochs and output types enter this answer.
  if (datasetId && trainings.length) {
    const runIds = trainings.map((training) => String(training._id));
    const [epochs, projects] = await Promise.all([
      Epoch.find({ trainingId: { $in: runIds }, deletedAt: null })
        .select('trainingId epoch epoch_uuid results')
        .sort({ epoch: 1 })
        .lean(),
      Project.find({
        _id: {
          $in: trainings
            .map((training) => training.projectId)
            .filter((id): id is string => Boolean(id && isValidObjectId(id)))
        }
      })
        .select('taxonomy.metrics')
        .lean()
    ]);
    const types = await EpochVisualization.aggregate<{ _id: string; types: string[] }>([
      { $match: { epoch_uuid: { $in: epochs.map((epoch) => epoch.epoch_uuid) } } },
      { $group: { _id: '$epoch_uuid', types: { $addToSet: '$type' } } }
    ]);
    const byEpoch = new Map(types.map((row) => [row._id, row.types]));
    const byRun = new Map<string, typeof epochs>();
    for (const epoch of epochs) {
      const rows = byRun.get(epoch.trainingId) ?? [];
      rows.push(epoch);
      byRun.set(epoch.trainingId, rows);
    }
    const taxonomy = new Map(projects.map((project) => [String(project._id), project.taxonomy?.metrics]));
    return {
      trainings: trainingsOutput.map((training, index) => {
        const original = trainings[index];
        const recorded = byRun.get(String(original._id)) ?? [];
        return {
          ...training,
          visualizationTypes: [...new Set(recorded.flatMap((epoch) => byEpoch.get(epoch.epoch_uuid) ?? []))].sort(),
          bestMetrics: summarizeMetrics(recorded, taxonomy.get(original.projectId ?? ''))
        };
      }),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    };
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
}
