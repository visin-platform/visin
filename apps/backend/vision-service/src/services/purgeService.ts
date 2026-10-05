import { logger } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Project, { type IProject } from '../models/Project';
import Training from '../models/Training';
import Epoch from '../models/Epoch';
import Evaluation from '../models/Evaluation';
import Suite from '../models/Suite';
import { reserveSuiteSlug } from './suiteSlugService';
import { invalidatePublic } from './publicCache';
import { purgeRunEvaluations } from './runEvaluations';
import Benchmark from '../models/Benchmark';
import EpochVisualization from '../models/EpochVisualization';
import Comparison from '../models/Comparison';
import Finding from '../models/Finding';
import Paper from '../models/Paper';
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
  await purgeRunEvaluations({ trainingIds, epochUuids });
  await Benchmark.deleteMany({ training_id: { $in: trainingIds } });
  await Epoch.deleteMany({ trainingId: { $in: trainingIds } });
  await Comparison.updateMany({ itemIds: { $in: trainingIds } }, { $pull: { itemIds: { $in: trainingIds } } });
  await Training.deleteMany({ _id: { $in: trainingIds } });
}

/**
 * Delete this project's suites that no evaluation uses any more, and any suite of a project that is already gone
 * which this project's evaluations were the last to use (it stayed, unreadable, only for their sake). Only the
 * suites involved are looked at, never every evaluation in the deployment.
 */
async function deleteSuitesNoOneNeeds(projectId: string, judgedOn: string[]): Promise<void> {
  const candidates = await Suite.find({ $or: [{ projectId }, { _id: { $in: judgedOn } }] }).select('_id projectId');
  if (candidates.length === 0) return;
  const stillUsed = new Set(await Evaluation.distinct('suite.id', { 'suite.id': { $in: candidates.map(suite => suite._id.toString()) } }));
  const owners = [...new Set(candidates.map(suite => suite.projectId).filter(id => id !== projectId && isValidObjectId(id)))];
  const living = new Set((await Project.find({ _id: { $in: owners } }).select('_id')).map(owner => owner._id.toString()));
  const unneeded = candidates.filter(suite => !stillUsed.has(suite._id.toString()) && (suite.projectId === projectId || !living.has(suite.projectId)));
  await Suite.deleteMany({ _id: { $in: unneeded.map(suite => suite._id) } });
}

/**
 * Delete a project for good: every training in it (trashed on their own or
 * not), its evaluations, comparisons, findings and configs, then the project.
 *
 * Its suites go too, unless another project still has evaluations on one: those
 * results keep the protocol they were judged on, and the suite stays (unreadable,
 * since its project is gone) until they are purged themselves.
 */
export async function purgeProject(project: IProject): Promise<void> {
  const projectId = project._id.toString();
  // Keep names from being reassigned after their URLs have been used, including legacy suites.
  // Resolve conflicting historical ownership before any destructive work on this project.
  const slugs = await Suite.distinct('slug', { projectId });
  for (const slug of slugs) await reserveSuiteSlug(slug, projectId);
  const trainings = await Training.find({ projectId }).select('_id');
  await purgeTrainings(trainings.map(training => training._id.toString()));
  const judgedOn = (await Evaluation.distinct('suite.id', { projectId })).filter((id): id is string => isValidObjectId(id));
  await Evaluation.deleteMany({ projectId });
  await deleteSuitesNoOneNeeds(projectId, judgedOn);
  await Comparison.deleteMany({ projectId });
  await Finding.deleteMany({ projectId });
  await Config.deleteMany({ projectId });
  await Project.deleteOne({ _id: project._id });
  invalidatePublic();
}

/**
 * The sweeper's run: delete projects, trainings, evaluations and papers trashed more than
 * `TRASH_DAYS` ago. A training in a trashed project waits for its project.
 * Idempotent, so a missed or repeated run does no harm.
 */
export async function purgeExpiredTrash(now = new Date()): Promise<{ projects: number; trainings: number; evaluations: number; papers: number }> {
  const cutoff = new Date(now.getTime() - TRASH_DAYS * DAY_MS);
  const found = await Project.find({ trashedAt: { $lte: cutoff } });
  // One project that cannot be purged (a suite name with conflicting past owners) must not stop the sweep: it is
  // retried on the next run, and every other project, run and evaluation is still purged on schedule.
  const projects: IProject[] = [];
  for (const project of found) {
    try {
      await purgeProject(project);
      projects.push(project);
    } catch (error) {
      logger.error('Could not purge a trashed project; it stays in the trash', { projectId: project._id.toString(), error: (error as Error).message });
    }
  }

  const trashedProjectIds = (await Project.find({ trashedAt: { $ne: null } }).select('_id')).map(project => project._id.toString());
  const trainings = await Training.find({ deletedAt: { $lte: cutoff }, projectId: { $nin: trashedProjectIds } }).select('_id');
  await purgeTrainings(trainings.map(training => training._id.toString()));

  // An evaluation in the trash is purged on the same schedule as a run, with its (possibly large) results.
  const evaluations = (await Evaluation.deleteMany({ deletedAt: { $lte: cutoff } })).deletedCount ?? 0;
  if (evaluations > 0) invalidatePublic();

  // A paper is only an address card, so there is nothing under it to delete first.
  const papers = (await Paper.deleteMany({ trashedAt: { $lte: cutoff } })).deletedCount ?? 0;

  if (projects.length + trainings.length + evaluations + papers > 0) {
    logger.info('Purged expired items from the trash', { projects: projects.length, trainings: trainings.length, evaluations, papers });
  }
  return { projects: projects.length, trainings: trainings.length, evaluations, papers };
}
