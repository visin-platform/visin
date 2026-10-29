import { Types } from 'mongoose';
import { BadRequestError } from '@visin/backend-core';
import Training, { ITraining } from '../models/Training';
import Epoch, { IEpoch } from '../models/Epoch';
import Benchmark, { IBenchmark } from '../models/Benchmark';
import { latestResultsByRun, type RunResultSummary } from './resultAggregation';
import { createProjectAccessChecker } from './projectAccessService';
import { costOf, costingByProject, costingFor } from './costingService';

type TrainingComparisonItem = RunResultSummary;
// benchmark.training_id is declared as a plain ObjectId, but these queries populate it
// with `name`/`uuid` — Mongoose's static types don't reflect .populate() shape changes.
type PopulatedTrainingRef = Pick<ITraining, '_id' | 'name' | 'uuid'>;

export async function compareTrainings(userId: string | undefined, trainingIds: string[]) {
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
  const foundTrainingIds = trainings.map((t) => t._id.toString());
  const epochs = await Epoch.find({ trainingId: { $in: foundTrainingIds }, deletedAt: null }).sort({
    trainingId: 1,
    epoch: 1
  });

  // Get all epoch UUIDs for fetching benchmarks
  const epochUuids = epochs.map((e) => e.epoch_uuid);

  // Get aggregated test results for these trainings
  const aggregatedTestResults = await latestResultsByRun(userId, foundTrainingIds);

  // Get all benchmarks for these trainings
  const benchmarks = await Benchmark.find({
    $or: [{ training_id: { $in: foundTrainingIds } }, { epoch_uuid: { $in: epochUuids } }],
    deletedAt: null
  }).populate('training_id', 'name uuid');

  // Group epochs by training ID
  const epochsByTraining: Record<string, IEpoch[]> = epochs.reduce(
    (acc, epoch) => {
      const trainingId = epoch.trainingId.toString();
      if (!acc[trainingId]) {
        acc[trainingId] = [];
      }
      acc[trainingId].push(epoch);
      return acc;
    },
    {} as Record<string, IEpoch[]>
  );

  // Group benchmarks by training ID
  const benchmarksByTraining: Record<string, IBenchmark[]> = benchmarks.reduce(
    (acc, benchmark) => {
      let trainingId: string | null = null;
      const populatedTrainingRef = benchmark.training_id as unknown as
        PopulatedTrainingRef | Types.ObjectId | string | null;
      if (populatedTrainingRef && typeof populatedTrainingRef === 'object' && '_id' in populatedTrainingRef) {
        trainingId = populatedTrainingRef._id.toString();
      } else if (typeof benchmark.training_id === 'string') {
        trainingId = benchmark.training_id;
      } else {
        // Try to find via epoch_uuid
        const epoch = epochs.find((e) => e.epoch_uuid === benchmark.epoch_uuid);
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
    },
    {} as Record<string, IBenchmark[]>
  );

  // Compared trainings often come from different projects, so each one's costs
  // use its own project's rates.
  const byProject = await costingByProject(trainings.map((t) => t.projectId));

  // Calculate comparison data for each training
  const comparisonData = trainings.map((training) => {
    const trainingId = training._id.toString();
    const trainingEpochs = epochsByTraining[trainingId] || [];
    const trainingAggregatedResults: TrainingComparisonItem | undefined = aggregatedTestResults.comparison.find(
      (item) => item.training._id.toString() === trainingId
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
      lastEpoch: lastEpoch
        ? {
            epoch: lastEpoch.epoch,
            results: lastEpoch.results,
            timestamp: lastEpoch.timestamp
          }
        : null,
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
      trainingsWithEpochs: comparisonData.filter((c) => c.epochs.length > 0).length,
      trainingsWithTestResults: comparisonData.filter((c) => c.aggregatedTestResults !== null).length,
      trainingsWithBenchmarks: comparisonData.filter((c) => c.benchmarks.length > 0).length
    }
  };
}
