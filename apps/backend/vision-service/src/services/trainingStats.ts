import { QueryFilter } from 'mongoose';
import { tokenProjectId } from '../middleware/projectTokenContext';
import { ForbiddenError, NotFoundError } from '@visin/backend-core';
import Training, { ITraining } from '../models/Training';
import { checkProjectAccess, getVisibleProjectIds, resolveProject } from './projectAccessService';
import { costOf, costingByProject, costingFor } from './costingService';
import type { TrainingFilters } from './trainingTypes';

interface CurrencyCostTotal {
  currency: string;
  totalCpuCost: number;
  totalGpuCost: number;
  totalCost: number;
}

export async function getTrainingStats(userId: string | undefined, filters: TrainingFilters) {
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
    if (!(await checkProjectAccess(userId, projectId))) {
      throw new ForbiddenError('Access denied to project');
    }
    const project = await resolveProject(projectId);
    if (!project) throw new NotFoundError('Project not found');
    matchQuery.projectId = project._id.toString();
  } else {
    // No project filter given: scope to trainings the caller can actually
    // see — otherwise these aggregate stats are computed across every
    // project regardless of privacy.
    // Same set getTrainings lists.
    matchQuery.projectId = { $in: await getVisibleProjectIds(userId) };
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
        avgEpochTime: {
          $cond: { if: { $gt: ['$totalEpochs', 0] }, then: { $divide: ['$totalTime', '$totalEpochs'] }, else: 0 }
        }
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
          {
            $match: {
              $expr: { $eq: ['$trainingId', { $toString: '$$trainingId' }] },
              $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
            }
          },
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

  const byProject = await costingByProject(perProject.map((row) => row._id));
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
      currency: rates.currency,
      totalCpuCost: 0,
      totalGpuCost: 0,
      totalCost: 0
    };
    subtotal.totalCpuCost += cost.cpuCost!;
    subtotal.totalGpuCost += cost.gpuCost!;
    subtotal.totalCost += cost.totalCost!;
    totalsByCurrency.set(rates.currency, subtotal);
  }
  const costTotalsByCurrency = [...totalsByCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency));

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
}
