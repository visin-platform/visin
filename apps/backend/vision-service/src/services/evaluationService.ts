import { randomUUID } from 'crypto';
import { atLeast, canChangeItem, ConflictError, ForbiddenError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Epoch from '../models/Epoch';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import Project from '../models/Project';
import Training from '../models/Training';
import Suite from '../models/Suite';
import type { EvaluationBody, ListEvaluationsQuery } from '../validation/evaluationSchemas';
import { type ValidationReport } from './evaluationEligibility';
import { isWithinTokenScope, projectPermission, resolveProject } from './projectAccessService';
import { evaluationScope, readerVisible, visibleToReader } from './evaluationScope';
import { invalidatePublic } from './publicCache';
import { requireCheckpointStorage } from './sourceRegistry';
import { contentHashOf } from './evaluationContent';
import { touchProjectActivity } from './projectActivity';
import { selectedAttemptId } from './leaderboardPoolService';
import { MAX_PAGE_SIZE } from '../validation/common';
import { EvaluationView, Reader, toView } from './evaluationView';
import { requireActor, recordVisibility, withdrawSuperseded, writableProject, judge, touchRun, resolveSource, projectRefOf, claimCorrection, sameResult } from './evaluationWriteSupport';

// The service's public surface stays here, whichever file a piece now lives in.
export { promoteEvaluation } from './evaluationPromote';
export { suiteLeaderboard, type LeaderboardView } from './evaluationLeaderboard';
export { recordVisibility } from './evaluationWriteSupport';
export type { EvaluationView } from './evaluationView';

const MAX_PAGE = MAX_PAGE_SIZE;

export interface EvaluationCheck {
  validation: ValidationReport;
  checkpointKey?: string;
  suite?: { slug: string; version: number; digest: string };
}

/**
 * Judge a result without storing it, so a pipeline learns why it would be unranked before it uploads anything.
 * It needs the same access as recording one, and the same suite: a dry run is not a way to probe private suites.
 */
export async function checkEvaluation(userId: string | undefined, body: EvaluationBody): Promise<EvaluationCheck> {
  const actor = requireActor(userId);
  const { project } = await writableProject(await projectRefOf(body), actor);
  requireCheckpointStorage(project, body.checkpoint);
  const { suite, report, key } = await judge(body, actor);
  return {
    validation: report,
    ...(key ? { checkpointKey: key } : {}),
    ...(suite ? { suite: { slug: suite.slug, version: suite.version, digest: suite.digest } } : {})
  };
}

/**
 * Record an evaluation. Idempotent per (project, uuid): the same result again is answered with the stored one,
 * a different result under that uuid is a conflict, and two simultaneous uploads create one row.
 */
export async function createEvaluation(
  userId: string | undefined,
  body: EvaluationBody
): Promise<{ evaluation: EvaluationView; created: boolean }> {
  const actor = requireActor(userId);
  const { project, projectId } = await writableProject(await projectRefOf(body), actor);
  requireCheckpointStorage(project, body.checkpoint);

  const uuid = body.uuid ?? randomUUID();
  const contentHash = contentHashOf(body);
  const existing = await Evaluation.findOne({ projectId, uuid });
  if (existing) {
    // A retry of something in the trash is not "already recorded": the result is invisible everywhere, and saying it
    // was stored would leave the pipeline believing it is on the leaderboard.
    if (existing.deletedAt) {
      throw new ConflictError(`An evaluation with uuid ${existing.uuid} is in the trash. Restore it, or send a new uuid.`);
    }
    return { evaluation: toView(sameResult(existing, contentHash), true), created: false };
  }

  const { suite, report, key } = await judge(body, actor);
  const source = await resolveSource(body, projectId);
  const id = new Types.ObjectId();
  const corrected = body.supersedesId ? await claimCorrection(body.supersedesId, projectId, id.toString(), suite?._id.toString(), key) : undefined;

  try {
    const created = await Evaluation.create({
      _id: id,
      uuid,
      projectId,
      ownerId: actor,
      ...(body.checkpoint ? { checkpoint: body.checkpoint, checkpointKey: key } : {}),
      ...(source ? { source } : {}),
      ...(suite ? { suite: { id: suite._id.toString(), slug: suite.slug, version: suite.version, digest: suite.digest } } : {}),
      status: body.status,
      results: body.results,
      ...(body.sampleCounts ? { sampleCounts: body.sampleCounts } : {}),
      ...(body.evidence ? { evidence: { kind: 'observed', ...body.evidence } } : {}),
      ...(body.provenance ? { provenance: body.provenance } : {}),
      ...(body.executedAt ? { executedAt: body.executedAt } : {}),
      receivedAt: new Date(),
      validation: report,
      ...(body.supersedesId ? { supersedesId: body.supersedesId } : {}),
      contentHash
    });
    if (corrected?.wasPublished) recordVisibility(corrected.evaluation, project, actor, 'private');
    await withdrawSuperseded(created, project, actor);
    await touchRun(source);
    await touchProjectActivity(projectId);
    invalidatePublic();
    return { evaluation: toView(created, true), created: true };
  } catch (error) {
    // Nothing was stored, so the evaluation it was to replace is its own again.
    if (corrected) await Evaluation.updateOne({ _id: corrected.evaluation._id, supersededById: id.toString() }, { $unset: { supersededById: 1 } });
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await Evaluation.findOne({ projectId, uuid });
    if (!winner) throw error;
    return { evaluation: toView(sameResult(winner, contentHash), true), created: false };
  }
}

export async function listEvaluations(userId: string | undefined, query: ListEvaluationsQuery) {
  const scope = await evaluationScope(userId);
  // A project the caller can only read shows them its runs' tests and what was published there.
  const clauses: QueryFilter<IEvaluation>[] = [
    { deletedAt: null },
    { $or: [{ projectId: { $in: scope.full } }, { projectId: { $in: scope.published }, ...readerVisible }] }
  ];
  if (query.projectId) {
    const project = await resolveProject(query.projectId);
    clauses.push({ projectId: project ? project._id.toString() : '' });
  }
  if (query.suite) {
    // A suite the caller cannot read has no evaluations they may see: answer as if it had none.
    clauses.push({ 'suite.slug': query.suite.slug, 'suite.version': query.suite.version });
  }
  if (query.checkpointKey) clauses.push({ checkpointKey: query.checkpointKey });
  if (query.state) clauses.push({ 'validation.state': query.state });
  if (query.status) clauses.push({ status: query.status });
  if (query.trainingId || query.trainingUuid) {
    // A run that is gone or not visible has nothing to list: the same empty answer, so none is verified.
    const training = await Training.findOne({ ...(query.trainingUuid ? { uuid: query.trainingUuid } : { _id: query.trainingId }), deletedAt: null });
    clauses.push({ 'source.trainingId': training ? training._id.toString() : '' });
  }
  if (query.epoch !== undefined) clauses.push({ 'source.epoch': query.epoch });
  if (query.epochUuids?.length) clauses.push({ 'source.epochUuid': { $in: query.epochUuids } });
  const filter: QueryFilter<IEvaluation> = { $and: clauses };

  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 30, MAX_PAGE);
  const full = new Set(scope.full);
  const withResults = query.include === 'results';
  const sortField = query.sortBy === 'epoch' ? 'source.epoch' : query.sortBy;
  const [total, rows] = await Promise.all([
    Evaluation.countDocuments(filter),
    Evaluation.find(filter)
      .select(withResults ? '-provenance' : '-results -provenance')
      .sort({ [sortField]: query.order, _id: query.order })
      .skip((page - 1) * limit)
      .limit(limit)
  ]);
  const parents = await runsOf(rows);
  return {
    evaluations: rows.map(row => ({
      ...toView(row, withResults, full.has(row.projectId) ? 'member' : 'public'),
      ...parents(row)
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
}

/**
 * The run and epoch each row came from, in two queries for the whole page: a row from a run is shown with the run's
 * name and the epoch's number, so a list of what a model scored says where each score came from. A parent that is in the
 * trash is not named.
 */
async function runsOf(rows: IEvaluation[]): Promise<(row: IEvaluation) => Pick<EvaluationView, 'run' | 'epochInfo'>> {
  const trainingIds = [...new Set(rows.flatMap(row => (row.source?.trainingId ? [row.source.trainingId] : [])))].filter(id => isValidObjectId(id));
  const epochUuids = [...new Set(rows.flatMap(row => (row.source?.epochUuid ? [row.source.epochUuid] : [])))];
  const [trainings, epochs] = await Promise.all([
    trainingIds.length ? Training.find({ _id: { $in: trainingIds }, deletedAt: null }).select('name uuid status').lean() : [],
    epochUuids.length ? Epoch.find({ epoch_uuid: { $in: epochUuids }, trainingId: { $in: trainingIds }, deletedAt: null }).select('trainingId epoch_uuid epoch epoch_time').lean() : []
  ]);
  const runs = new Map(trainings.map(training => [training._id.toString(), { _id: training._id.toString(), name: training.name, uuid: training.uuid, status: training.status }]));
  const at = new Map(epochs.map(epoch => [epoch.epoch_uuid, { trainingId: epoch.trainingId, info: { epoch: epoch.epoch, ...(epoch.epoch_time !== undefined ? { epoch_time: epoch.epoch_time } : {}) } }]));
  return row => {
    const run = row.source?.trainingId ? runs.get(row.source.trainingId) : undefined;
    // Epoch identifiers are reported by a client. Enrich only a matching source run, so naming another run's epoch
    // cannot reveal its measurements, even when another evaluation in the same page happens to name that run.
    const epoch = row.source?.epochUuid ? at.get(row.source.epochUuid) : undefined;
    const epochInfo = epoch?.trainingId === row.source?.trainingId ? epoch?.info : undefined;
    return { ...(run ? { run } : {}), ...(epochInfo ? { epochInfo } : {}) };
  };
}

/**
 * A live evaluation the caller may read, and how they read it; otherwise the same not-found, so a private one is not
 * verified. Someone who can only read the project (it is public, and they are not part of it) is told of a test a run
 * reported, and of a result judged on a suite only once it is published, and in the public form of either.
 */
async function readableEvaluation(filter: QueryFilter<IEvaluation>, userId: string | undefined): Promise<{ evaluation: IEvaluation; reader: Reader }> {
  const evaluation = await Evaluation.findOne({ ...filter, deletedAt: null });
  const project = evaluation && isValidObjectId(evaluation.projectId) ? await Project.findById(evaluation.projectId) : null;
  const permission = await projectPermission(project, userId);
  if (!evaluation || !atLeast(permission, 'read')) throw new NotFoundError('Evaluation not found');
  const reader: Reader = atLeast(permission, 'contribute') ? 'member' : 'public';
  if (reader === 'public' && !visibleToReader(evaluation)) throw new NotFoundError('Evaluation not found');
  return { evaluation, reader };
}

export async function getEvaluation(id: string, userId: string | undefined): Promise<EvaluationView> {
  if (!isValidObjectId(id)) throw new NotFoundError('Evaluation not found');
  const { evaluation, reader } = await readableEvaluation({ _id: id }, userId);
  return toView(evaluation, true, reader);
}

/** By the writer's own uuid, which is unique only within a project: so the project is part of the address. */
export async function getEvaluationByUuid(uuid: string, projectRef: string, userId: string | undefined): Promise<EvaluationView> {
  const project = await resolveProject(projectRef);
  if (!project) throw new NotFoundError('Evaluation not found');
  const { evaluation, reader } = await readableEvaluation({ uuid, projectId: project._id.toString() }, userId);
  return toView(evaluation, true, reader);
}

/** Move an evaluation to the trash, or bring it back. Needs `manage`, or `contribute` for what the caller recorded. */
export async function setEvaluationTrashed(id: string, userId: string | undefined, trashed: boolean): Promise<EvaluationView> {
  const actor = requireActor(userId);
  if (!isValidObjectId(id)) throw new NotFoundError('Evaluation not found');
  const evaluation = await Evaluation.findOne({ _id: id });
  const project = evaluation && isValidObjectId(evaluation.projectId) ? await Project.findById(evaluation.projectId) : null;
  const permission = await projectPermission(project, actor);
  if (!evaluation || !atLeast(permission, 'read') || (!atLeast(permission, 'contribute') && !visibleToReader(evaluation))) throw new NotFoundError('Evaluation not found');
  if (!isWithinTokenScope(undefined, evaluation.projectId)) throw new ForbiddenError('A credential limited to one project cannot change another project\'s evaluation');
  if (!canChangeItem(permission, evaluation.ownerId, actor)) throw new ForbiddenError('Write permission is required for this evaluation');
  // A correction that comes back takes over again from the result it replaces: refuse while another one holds it.
  const replaces = !trashed && evaluation.supersedesId ? await Evaluation.findOne({ _id: evaluation.supersedesId, deletedAt: null }) : null;
  if (replaces?.supersededById && replaces.supersededById !== evaluation._id.toString()) {
    throw new ConflictError('Another correction already replaces the result this one corrected. Trash that one first, then restore this.');
  }
  if (trashed && !evaluation.deletedAt) evaluation.deletedAt = new Date();
  if (!trashed) evaluation.deletedAt = undefined;
  // Publishing is a deliberate decision about one result, so a result taken to the trash is also taken down, and a
  // restore never puts it back on a public leaderboard by itself.
  const withdrawn = trashed && Boolean(evaluation.publishedAt);
  if (withdrawn) {
    evaluation.publishedAt = undefined;
    evaluation.publishedBy = undefined;
  }
  try {
    await evaluation.save();
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    throw new ConflictError('Another evaluation of this result on this suite is already live. Trash that one first, then restore this.');
  }
  if (evaluation.supersedesId) {
    // The result a trashed correction replaced is ranked again; a restored correction replaces it again.
    if (trashed) {
      await Evaluation.updateOne({ _id: evaluation.supersedesId, supersededById: evaluation._id.toString() }, { $unset: { supersededById: 1 } });
    } else if (replaces && !replaces.supersededById) {
      const hadPublication = Boolean(replaces.publishedAt);
      replaces.supersededById = evaluation._id.toString();
      replaces.publishedAt = undefined;
      replaces.publishedBy = undefined;
      await replaces.save();
      if (hadPublication && project) recordVisibility(replaces, project, actor, 'private');
    }
  }
  if (withdrawn && project) recordVisibility(evaluation, project, actor, 'private');
  invalidatePublic();
  return toView(evaluation, false);
}

/**
 * Put one evaluation on the public leaderboard of its suite, or take it off. Needs `manage` on the project.
 *
 * Only a ranked result can be published, in a project and a suite that are both public: a public suite alone
 * grants nothing in a private project, and a public project does not publish its results by existing. The public
 * views re-check all of it on every read, so making the project private, trashing the result or withdrawing it
 * removes it at once. Both directions are recorded, and both are idempotent.
 */
export async function setEvaluationPublished(id: string, userId: string | undefined, published: boolean): Promise<EvaluationView> {
  const actor = requireActor(userId);
  if (!isValidObjectId(id)) throw new NotFoundError('Evaluation not found');
  const evaluation = await Evaluation.findOne({ _id: id, deletedAt: null });
  const project = evaluation && isValidObjectId(evaluation.projectId) ? await Project.findById(evaluation.projectId) : null;
  const permission = await projectPermission(project, actor);
  if (!evaluation || !project || !atLeast(permission, 'read') || (!atLeast(permission, 'contribute') && !visibleToReader(evaluation))) throw new NotFoundError('Evaluation not found');
  if (!isWithinTokenScope(undefined, evaluation.projectId)) throw new ForbiddenError('A credential limited to one project cannot publish another project\'s evaluation');
  if (!atLeast(permission, 'manage')) throw new ForbiddenError('Manage access to the project is required to publish or withdraw a result');

  if (published) {
    if (evaluation.status !== 'completed' || evaluation.validation.state !== 'eligible' || !evaluation.suite) {
      throw new ConflictError('Only a ranked result can be published. See its verdict for what is missing.');
    }
    if (evaluation.supersededById) {
      throw new ConflictError('A correction replaces this result. Publish the correction instead.');
    }
    // A board shows each checkpoint by its latest ranked result. Publishing an earlier one would let the best of
    // several attempts stand in for the model, so only the latest can be published.
    const latest = await selectedAttemptId(evaluation.projectId, evaluation.suite.id, evaluation.checkpointKey!);
    if (latest && latest !== evaluation.id) {
      throw new ConflictError('A newer ranked result of this checkpoint exists, and a board shows the latest. Publish that one instead.');
    }
    if (project.visibility !== 'public') {
      throw new ConflictError('A result can only be published from a public project. Make the project public first.');
    }
    const suite = await Suite.findById(evaluation.suite.id);
    if (!suite || suite.visibility !== 'public') {
      throw new ConflictError(`Suite ${evaluation.suite.slug}@${evaluation.suite.version} is not public, so its leaderboard is not either.`);
    }
    if (evaluation.hiddenAt) {
      throw new ConflictError('A manager of the suite hid this result from its leaderboard, and only they can show it again.');
    }
    // The suite's own project may always publish to it; what other projects may do is the suite's policy.
    const own = suite.projectId === evaluation.projectId;
    const policy = suite.submissions ?? 'open';
    if (policy === 'members' && !own) {
      throw new ConflictError(`Suite ${suite.slug}@${suite.version} only takes results from its own project.`);
    }
    if (evaluation.publishedAt) return toView(evaluation, false);
    evaluation.publishedAt = new Date();
    evaluation.publishedBy = actor;
  } else if (evaluation.publishedAt) {
    evaluation.publishedAt = undefined;
    evaluation.publishedBy = undefined;
  } else {
    return toView(evaluation, false);
  }
  await evaluation.save();
  invalidatePublic();
  recordVisibility(evaluation, project, actor, published ? 'public' : 'private');
  return toView(evaluation, false);
}
