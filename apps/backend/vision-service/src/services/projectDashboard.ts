import { atLeast } from '@visin/backend-core';
import { costOf, resolveCosting } from '../models/costing';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Evaluation from '../models/Evaluation';
import { readerVisible } from './evaluationScope';
import Benchmark from '../models/Benchmark';
import { projectPermission } from './projectAccessService';
import { requireProject } from './projectSupport';

interface ProjectDashboardStats {
  trainingStats: {
    totalTrainings: number;
    totalTime: number;
    totalEpochs: number;
    avgEpochTime: number;
    /** absent when the project has not priced its hardware */
    totalCpuCost?: number;
    totalGpuCost?: number;
    totalCost?: number;
    /** ISO code the amounts above are denominated in */
    currency?: string;
  };
  testResultsCount: number;
  visualizationsCount: number;
  benchmarksCount: number;
}

export const getProjectDashboardStats = async (
  identifier: string,
  userId: string | undefined
): Promise<ProjectDashboardStats> => {
  const project = await requireProject(identifier, userId);

  const projectId = project._id.toString();
  const NOT_DELETED = [{ deletedAt: null }, { deletedAt: { $exists: false } }];

  // The project's trainings, once. Everything below is scoped by these, and
  // reading them here means the counts join against 118 ids rather than
  // re-deriving the set inside three separate pipelines.
  const trainings = await Training.find({ projectId, deletedAt: null }).select('_id');
  const trainingObjectIds = trainings.map(t => t._id);
  const trainingIds = trainingObjectIds.map(id => id.toString());

  // Sum and count inside the join, so an epoch never leaves the database.
  // The previous form `$lookup`-ed every epoch document into an array and then
  // measured the array: 22,526 documents materialised to produce two numbers.
  const trainingAggregationPipeline = [
    { $match: { projectId, deletedAt: null } },
    {
      $lookup: {
        from: 'training_epoches',
        let: { trainingId: { $toString: '$_id' } },
        pipeline: [
          { $match: { $expr: { $eq: ['$trainingId', '$$trainingId'] }, $or: NOT_DELETED } },
          { $group: { _id: null, time: { $sum: '$epoch_time' }, count: { $sum: 1 } } }
        ],
        as: 'epochStats'
      }
    },
    {
      $addFields: {
        trainingTime: { $ifNull: [{ $arrayElemAt: ['$epochStats.time', 0] }, 0] },
        epochCount: { $ifNull: [{ $arrayElemAt: ['$epochStats.count', 0] }, 0] }
      }
    },
    {
      $group: {
        _id: null,
        totalTrainings: { $sum: 1 },
        totalTime: { $sum: '$trainingTime' },
        totalEpochs: { $sum: '$epochCount' }
      }
    },
    {
      // Costs are applied in JS below, at this project's own rates.
      $addFields: {
        totalHours: { $divide: ['$totalTime', 3600] },
        avgEpochTime: { $cond: { if: { $gt: ['$totalEpochs', 0] }, then: { $divide: ['$totalTime', '$totalEpochs'] }, else: 0 } }
      }
    }
  ];

  // Visualizations still belong to epochs; evaluations carry their project and run directly.
  const countByEpoch = (collection: string) =>
    Epoch.aggregate([
      { $match: { trainingId: { $in: trainingIds }, $or: NOT_DELETED } },
      // Keep the join limited to live records.
      {
        $lookup: {
          from: collection,
          localField: 'epoch_uuid',
          foreignField: 'epoch_uuid',
          pipeline: [{ $match: { $or: NOT_DELETED } }],
          as: 'joined'
        }
      },
      { $group: { _id: null, count: { $sum: { $size: '$joined' } } } }
    ]);

  const fullResults = atLeast(await projectPermission(project, userId), 'contribute');

  // All four are independent, and they used to be awaited one after another —
  // so the endpoint's latency was their sum. It answers with about 300 bytes
  // and was measured at 3.9s against production.
  const [trainingResult, testResultsCount, visualizationsResult, benchmarksCount] = await Promise.all([
    Training.aggregate(trainingAggregationPipeline),
    Evaluation.countDocuments({
      projectId,
      'source.trainingId': { $in: trainingIds },
      deletedAt: null,
      ...(!fullResults ? readerVisible : {})
    }),
    countByEpoch('epoch_visualizations'),
    Benchmark.countDocuments({
      training_id: { $in: trainingObjectIds },
      $or: NOT_DELETED
    })
  ]);

  const trainingStats = trainingResult[0] || {
    totalTrainings: 0,
    totalTime: 0,
    totalEpochs: 0,
    avgEpochTime: 0
  };
  const visualizationsCount = visualizationsResult[0]?.count || 0;

  const costing = resolveCosting(project.costing);
  const cost = costOf(trainingStats.totalTime, costing);

  return {
    trainingStats: {
      totalTrainings: trainingStats.totalTrainings,
      totalTime: trainingStats.totalTime,
      totalEpochs: trainingStats.totalEpochs,
      avgEpochTime: trainingStats.avgEpochTime,
      totalCpuCost: cost.cpuCost,
      totalGpuCost: cost.gpuCost,
      totalCost: cost.totalCost,
      currency: cost.currency
    },
    testResultsCount,
    visualizationsCount,
    benchmarksCount
  };
};
