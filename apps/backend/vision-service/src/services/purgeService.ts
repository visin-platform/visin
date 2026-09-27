import { logger } from '@visin/backend-core';
import Project, { type IProject } from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import TestResult from '../models/TestResult';
import Benchmark from '../models/Benchmark';
import EpochVisualization from '../models/EpochVisualization';
import Comparison from '../models/Comparison';
import Finding from '../models/Finding';
import Config from '../models/Config';
import { deleteFiles } from '../clients/fileServiceClient';

/** How long something waits in the trash before it is deleted for good. */
export const TRASH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete trainings for good, with everything under them: epochs, test results,
 * benchmarks, visualizations and their stored files. They are also pulled out
 * of every comparison that lists them.
 *
 * Files go first: when file-service fails, this throws with the records still
 * in place, so the next run finds them and tries again. Idempotent.
 */
export async function purgeTrainings(trainingIds: string[]): Promise<void> {
  if (trainingIds.length === 0) return;
  const epochUuids = (await Epoch.find({ trainingId: { $in: trainingIds } }).select('epoch_uuid')).map(epoch => epoch.epoch_uuid);
  const visualizations = await EpochVisualization.find({ epoch_uuid: { $in: epochUuids } }).select('fileId');
  await deleteFiles(visualizations.map(visualization => visualization.fileId));

  await EpochVisualization.deleteMany({ epoch_uuid: { $in: epochUuids } });
  await TestResult.deleteMany({ epoch_uuid: { $in: epochUuids } });
  await Benchmark.deleteMany({ training_id: { $in: trainingIds } });
  await Epoch.deleteMany({ trainingId: { $in: trainingIds } });
  await Comparison.updateMany({ itemIds: { $in: trainingIds } }, { $pull: { itemIds: { $in: trainingIds } } });
  await Training.deleteMany({ _id: { $in: trainingIds } });
}

/**
 * Delete a project for good: every training in it (trashed on their own or
 * not), its comparisons, findings and configs, then the project.
 */
export async function purgeProject(project: IProject): Promise<void> {
  const projectId = project._id.toString();
  const trainings = await Training.find({ projectId }).select('_id');
  await purgeTrainings(trainings.map(training => training._id.toString()));
  await Comparison.deleteMany({ projectId });
  await Finding.deleteMany({ projectId });
  await Config.deleteMany({ projectId });
  await Project.deleteOne({ _id: project._id });
}

/**
 * The sweeper's run: delete projects and trainings trashed more than
 * `TRASH_DAYS` ago. A training in a trashed project waits for its project.
 * Idempotent, so a missed or repeated run does no harm.
 */
export async function purgeExpiredTrash(now = new Date()): Promise<{ projects: number; trainings: number }> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
  const projects = await Project.find({ trashedAt: { $lte: cutoff } });
  for (const project of projects) await purgeProject(project);

  const trashedProjectIds = (await Project.find({ trashedAt: { $ne: null } }).select('_id')).map(project => project._id.toString());
  const trainings = await Training.find({ deletedAt: { $lte: cutoff }, projectId: { $nin: trashedProjectIds } }).select('_id');
  await purgeTrainings(trainings.map(training => training._id.toString()));

  if (projects.length + trainings.length > 0) {
    logger.info('Purged expired items from the trash', { projects: projects.length, trainings: trainings.length });
  }
  return { projects: projects.length, trainings: trainings.length };
}
