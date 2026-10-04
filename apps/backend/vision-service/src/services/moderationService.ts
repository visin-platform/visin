import { atLeast, ForbiddenError, NotFoundError, UnauthorizedError, ConflictError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import Project from '../models/Project';
import Suite, { type ISuite } from '../models/Suite';
import { isWithinTokenScope } from './projectAccessService';
import { recordVisibility } from './evaluationService';
import { invalidatePublic } from './publicCache';
import { publicCheckpoint } from './sourceRegistry';
import { canReadSuite, permissionOnSuiteProject, readableSuite } from './suiteService';

/**
 * The people who run a suite decide what stands on its public leaderboard. A manager of the project that owns a suite
 * can verify the results other projects submitted, and take a result off the board
 * with a reason, whichever project it came from. They see only what the public sees of other projects' results: the
 * checkpoint, the project's name and the score, never the rest of that project's records.
 */

const requireActor = (userId: string | undefined): string => {
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
};

/** A manager of the suite's project; to anyone who cannot read the suite, it is not found. */
async function moderatedSuite(slug: string, version: number, actor: string): Promise<ISuite> {
  const suite = await readableSuite(slug, version, actor);
  if (!isWithinTokenScope(undefined, suite.projectId)) throw new ForbiddenError('A credential limited to one project cannot moderate another project\'s suite');
  if (!atLeast(await permissionOnSuiteProject(suite, actor), 'manage')) {
    throw new ForbiddenError('Manage access to the suite\'s project is required to approve or hide results');
  }
  return suite;
}

/** An evaluation judged on a suite the caller manages; any other reads as not found, so no result is confirmed. */
async function moderated(id: string, userId: string | undefined): Promise<{ evaluation: IEvaluation; suite: ISuite; actor: string }> {
  const actor = requireActor(userId);
  const evaluation = isValidObjectId(id) ? await Evaluation.findOne({ _id: id, deletedAt: null }) : null;
  const suite = evaluation?.suite ? await Suite.findById(evaluation.suite.id) : null;
  if (!evaluation || !suite || !(await canReadSuite(suite, actor))) throw new NotFoundError('Evaluation not found');
  await moderatedSuite(suite.slug, suite.version, actor);
  return { evaluation, suite, actor };
}

async function recordFor(evaluation: IEvaluation, actor: string, visibility: 'public' | 'private'): Promise<void> {
  const project = isValidObjectId(evaluation.projectId) ? await Project.findById(evaluation.projectId).select('owner') : null;
  if (project) recordVisibility(evaluation, project, actor, visibility);
}

/** Compatibility action: a suite manager verifies a published submission using the same verification fields. */
export async function approveEvaluation(id: string, userId: string | undefined): Promise<{ approved: boolean }> {
  const { evaluation, actor } = await moderated(id, userId);
  if (evaluation.verifiedAt) return { approved: true };
  if (!evaluation.publishedAt) throw new ConflictError('Only a published result can be verified by the suite manager.');
  evaluation.verifiedAt = new Date();
  evaluation.verifiedBy = actor;
  await evaluation.save();
  invalidatePublic();
  if (!evaluation.hiddenAt) await recordFor(evaluation, actor, 'public');
  return { approved: true };
}

/** Take a published result off the board, whichever project it came from; the reason is kept with it. */
export async function hideEvaluation(id: string, userId: string | undefined, reason: string): Promise<{ hidden: boolean }> {
  const { evaluation, actor } = await moderated(id, userId);
  if (!evaluation.publishedAt) throw new ConflictError('Only a published result can be hidden from a leaderboard.');
  if (evaluation.hiddenAt) return { hidden: true };
  evaluation.hiddenAt = new Date();
  evaluation.hiddenBy = actor;
  evaluation.hiddenReason = reason;
  await evaluation.save();
  invalidatePublic();
  await recordFor(evaluation, actor, 'private');
  return { hidden: true };
}

/** Let a hidden result stand on the board again (its publisher's decision to publish it is still in force). */
export async function unhideEvaluation(id: string, userId: string | undefined): Promise<{ hidden: boolean }> {
  const { evaluation, actor } = await moderated(id, userId);
  if (!evaluation.hiddenAt) return { hidden: false };
  evaluation.hiddenAt = undefined;
  evaluation.hiddenBy = undefined;
  evaluation.hiddenReason = undefined;
  await evaluation.save();
  invalidatePublic();
  if (evaluation.publishedAt) await recordFor(evaluation, actor, 'public');
  return { hidden: false };
}

export interface Submission {
  evaluationId: string;
  checkpoint?: ReturnType<typeof publicCheckpoint>;
  project?: { name: string; slug?: string };
  headline?: { key: string; value: number; unit?: string };
  publishedAt?: Date;
  hidden?: { at: Date; reason?: string };
}

/** What waits for a manager of a suite, and what they hid: the two lists they act on. */
export async function listSubmissions(slug: string, version: number, userId: string | undefined) {
  const actor = requireActor(userId);
  const suite = await moderatedSuite(slug, version, actor);
  const rows = await Evaluation.find({
    'suite.id': suite._id.toString(),
    deletedAt: null,
    publishedAt: { $ne: null },
    $or: [{ verifiedAt: { $exists: false } }, { hiddenAt: { $exists: true } }]
  })
    .select('checkpoint projectId validation.scores publishedAt verifiedAt hiddenAt hiddenReason')
    .sort({ publishedAt: -1 })
    .limit(200);
  const projectIds = [...new Set(rows.map(row => row.projectId))].filter(id => isValidObjectId(id));
  const projects = new Map((await Project.find({ _id: { $in: projectIds } }).select('name slug').lean()).map(project => [project._id.toString(), { name: project.name, slug: project.slug }]));
  const headline = suite.protocol.metrics.find(metric => metric.headline)!;
  const view = (row: IEvaluation): Submission => {
    const value = row.validation.scores?.overall?.[headline.key];
    return {
      evaluationId: row._id.toString(),
      checkpoint: publicCheckpoint(row.checkpoint),
      project: projects.get(row.projectId),
      ...(typeof value === 'number' ? { headline: { key: headline.key, value, ...(headline.unit ? { unit: headline.unit } : {}) } } : {}),
      publishedAt: row.publishedAt,
      ...(row.hiddenAt ? { hidden: { at: row.hiddenAt, ...(row.hiddenReason ? { reason: row.hiddenReason } : {}) } } : {})
    };
  };
  return {
    suite: { slug: suite.slug, version: suite.version, submissions: suite.submissions ?? 'open' },
    pending: rows.filter(row => !row.verifiedAt && !row.hiddenAt).map(view),
    hidden: rows.filter(row => row.hiddenAt).map(view)
  };
}
