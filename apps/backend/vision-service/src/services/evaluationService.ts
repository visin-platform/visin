import { randomUUID } from 'crypto';
import {
  atLeast,
  BadRequestError,
  canChangeItem,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  recordResourceEvent,
  UnauthorizedError,
  logger
} from '@visin/backend-core';
import { isValidObjectId, Types, type QueryFilter } from 'mongoose';
import Epoch from '../models/Epoch';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import Project, { type IProject } from '../models/Project';
import Training from '../models/Training';
import Suite, { type ISuite } from '../models/Suite';
import type {
  EvaluationBody,
  ListEvaluationsQuery,
  PromoteEvaluationBody,
  SuiteLeaderboardQuery
} from '../validation/evaluationSchemas';
import { checkpointKey } from './checkpointIdentity';
import { exploratoryReport, validateEvaluation, type ValidationReport } from './evaluationEligibility';
import { buildLeaderboard, type Candidate } from './leaderboardProjection';
import { isWithinTokenScope, permissionIgnoringKeyLimit, projectPermission, resolveProject } from './projectAccessService';
import { evaluationScope, readerVisible, visibleToReader } from './evaluationScope';
import { invalidatePublic } from './publicCache';
import { requireCheckpointStorage } from './sourceRegistry';
import { readableSuite } from './suiteService';
import { contentHashOf } from './evaluationContent';
import { touchProjectActivity } from './projectActivity';
import { DEFAULT_LEADERBOARD_PAGE, leaderboardPage, leaderboardPool, selectedAttemptId } from './leaderboardPoolService';

import { MAX_PAGE_SIZE } from '../validation/common';

const MAX_PAGE = MAX_PAGE_SIZE;

const requireActor = (userId: string | undefined): string => {
  if (!userId) throw new UnauthorizedError('Authentication required');
  return userId;
};

/** Say, in the project's record, that an evaluation was put on or taken off the public leaderboard. */
export function recordVisibility(
  evaluation: Pick<IEvaluation, '_id' | 'suite' | 'checkpointKey'>,
  project: { owner: IProject['owner'] },
  actor: string,
  visibility: 'public' | 'private'
): void {
  recordResourceEvent({
    service: 'vision-service',
    resourceType: 'evaluation',
    resourceId: evaluation._id.toString(),
    resourceName: `${evaluation.suite?.slug}@${evaluation.suite?.version} ${evaluation.checkpointKey ?? ''}`.trim(),
    action: 'visibility',
    actorId: actor,
    owner: project.owner,
    visibility
  });
}

/**
 * A new ranked result replaces the checkpoint's earlier ones on a public board, so the earlier published attempts are
 * withdrawn at once. Publishing is a decision about one result: the newer one has to be published on its own, and a
 * manager cannot leave an old, better attempt standing while newer ones are hidden.
 */
async function withdrawSuperseded(created: IEvaluation, project: { owner: IProject['owner'] }, actor: string): Promise<void> {
  if (created.status !== 'completed' || created.validation.state !== 'eligible' || !created.suite || !created.checkpointKey) return;
  const earlier = await Evaluation.find({
    projectId: created.projectId,
    'suite.id': created.suite.id,
    checkpointKey: created.checkpointKey,
    publishedAt: { $ne: null },
    deletedAt: null,
    _id: { $ne: created._id }
  });
  for (const row of earlier) {
    row.publishedAt = undefined;
    row.publishedBy = undefined;
    await row.save();
    recordVisibility(row, project, actor, 'private');
  }
}

export interface EvaluationView {
  _id: string;
  uuid: string;
  projectId: string;
  /** who recorded it: left out for a reader who can only see published results */
  ownerId?: string;
  checkpoint?: IEvaluation['checkpoint'];
  checkpointKey?: string;
  source?: IEvaluation['source'];
  suite?: IEvaluation['suite'];
  status: IEvaluation['status'];
  sampleCounts?: IEvaluation['sampleCounts'];
  /** what the evaluator observed, or the manager's attestation for a promoted result */
  evidence?: IEvaluation['evidence'];
  executedAt?: Date;
  receivedAt: Date;
  validation: ValidationReport;
  /** when it was put on a public leaderboard; absent when it is not */
  publishedAt?: Date;
  verifiedAt?: Date;
  verifiedBy?: string;
  /** taken off the suite's leaderboard by one of its managers, and why */
  hidden?: { at: Date; reason?: string };
  supersedesId?: string;
  /** the live correction that replaces it, when there is one: it is never ranked or published again */
  supersededById?: string;
  createdAt: Date;
  /** the run it came from, when it came from one that is still live */
  run?: { _id: string; name: string; uuid: string; status: string };
  /** the epoch it was recorded at, when that epoch is still live */
  epochInfo?: { epoch: number; epoch_time?: number };
  /** on a single evaluation, or a list asked to `include` them: lists carry summaries, not result blobs */
  results?: IEvaluation['results'];
  provenance?: IEvaluation['provenance'];
}

/** Who a reader is to an evaluation: someone in its project, or someone who can only see what was published. */
type Reader = 'member' | 'public';

/** What a public reader of a published result is told of its evidence: never who vouched for it. */
const publicEvidence = (evidence: IEvaluation['evidence']): IEvaluation['evidence'] => {
  if (evidence?.kind !== 'attested') return evidence;
  const { by: _by, ...rest } = evidence;
  return rest as IEvaluation['evidence'];
};

/** The evaluator is the only part of the run's provenance a public reader is shown: no host, command or environment. */
const publicProvenance = (provenance: IEvaluation['provenance']): IEvaluation['provenance'] =>
  provenance?.evaluator ? { evaluator: provenance.evaluator } : undefined;

const toView = (evaluation: IEvaluation, full: boolean, reader: Reader = 'member'): EvaluationView => ({
  _id: evaluation._id.toString(),
  uuid: evaluation.uuid,
  projectId: evaluation.projectId,
  ...(reader === 'member' ? { ownerId: evaluation.ownerId } : {}),
  ...(evaluation.checkpoint ? { checkpoint: evaluation.checkpoint } : {}),
  ...(evaluation.checkpointKey ? { checkpointKey: evaluation.checkpointKey } : {}),
  ...(evaluation.source ? { source: evaluation.source } : {}),
  ...(evaluation.suite ? { suite: evaluation.suite } : {}),
  status: evaluation.status,
  ...(evaluation.sampleCounts ? { sampleCounts: evaluation.sampleCounts } : {}),
  ...(evaluation.evidence ? { evidence: reader === 'member' ? evaluation.evidence : publicEvidence(evaluation.evidence) } : {}),
  ...(evaluation.executedAt ? { executedAt: evaluation.executedAt } : {}),
  receivedAt: evaluation.receivedAt,
  validation: evaluation.validation,
  ...(evaluation.publishedAt ? { publishedAt: evaluation.publishedAt } : {}),
  ...(evaluation.verifiedAt ? { verifiedAt: evaluation.verifiedAt } : {}),
  ...(evaluation.verifiedBy && reader === 'member' ? { verifiedBy: evaluation.verifiedBy } : {}),
  ...(evaluation.hiddenAt ? { hidden: { at: evaluation.hiddenAt, ...(evaluation.hiddenReason ? { reason: evaluation.hiddenReason } : {}) } } : {}),
  ...(evaluation.supersedesId ? { supersedesId: evaluation.supersedesId } : {}),
  ...(evaluation.supersededById ? { supersededById: evaluation.supersededById } : {}),
  createdAt: evaluation.createdAt,
  ...(full
    ? {
        results: evaluation.results,
        ...(reader === 'member'
          ? evaluation.provenance ? { provenance: evaluation.provenance } : {}
          : publicProvenance(evaluation.provenance) ? { provenance: publicProvenance(evaluation.provenance) } : {})
      }
    : {})
});

/**
 * A project the caller may add results to, resolved from an id or slug; refusals read the same as for a stranger.
 * `contribute` records a result; promoting someone else's old result into the ranking needs `manage`.
 */
async function writableProject(projectRef: string, userId: string, needs: 'contribute' | 'manage' = 'contribute') {
  const project = await resolveProject(projectRef);
  const projectId = project?._id.toString();
  if (!project || !projectId) throw new NotFoundError('Project not found');
  // What a stranger learns comes first: a credential limited to one project must not be able to tell a project its
  // owner cannot read from one that does not exist, so its own limit is spoken only for a project the owner can read.
  if (!atLeast(await permissionIgnoringKeyLimit(project, userId), 'read')) throw new NotFoundError('Project not found');
  if (!isWithinTokenScope(undefined, projectId)) {
    throw new ForbiddenError('A credential limited to one project cannot record results in another');
  }
  const permission = await projectPermission(project, userId);
  if (!atLeast(permission, needs)) {
    throw new ForbiddenError(
      needs === 'manage'
        ? 'Manage access to the project is required to promote a result into a ranking'
        : 'Contribute access to the project is required to record an evaluation'
    );
  }
  return { project, projectId };
}

interface Judged {
  suite?: ISuite;
  report: ValidationReport;
  key?: string;
}

/**
 * Resolve the suite and judge the result against it. A suite the caller cannot read, or that does not exist, is
 * a not-found; an archived suite refuses new results (the old ones stay), as a protocol that is retired.
 */
async function judge(body: EvaluationBody, userId: string, attested = false): Promise<Judged> {
  const key = body.checkpoint ? checkpointKey(body.checkpoint) : undefined;
  if (!body.suite) return { report: exploratoryReport(), key };
  const suite = await readableSuite(body.suite.slug, body.suite.version, userId);
  if (suite.archivedAt) throw new ConflictError(`Suite ${suite.slug}@${suite.version} is archived and takes no new results`);
  const report = validateEvaluation(suite.protocol, suite.digest, {
    status: body.status,
    results: body.results,
    checkpointKey: key,
    evidence: body.evidence,
    attested,
    sampleCounts: body.sampleCounts
  });
  return { suite, report, key };
}

/** A result from a run is activity on that run and epoch, which is how a run's list is ordered by what happened last. */
async function touchRun(source: IEvaluation['source']): Promise<void> {
  try {
    const now = new Date();
    if (source?.epochUuid) await Epoch.updateOne({ epoch_uuid: source.epochUuid, deletedAt: null }, { updatedAt: now });
    if (source?.trainingId && isValidObjectId(source.trainingId)) await Training.updateOne({ _id: source.trainingId }, { updatedAt: now });
  } catch (error) {
    logger.warn('Failed to update epoch/training timestamps', { error: (error as Error).message });
  }
}

async function resolveSource(body: EvaluationBody, projectId: string): Promise<IEvaluation['source']> {
  if (!body.source) return undefined;
  const { trainingUuid, epochUuid, epoch } = body.source;
  let trainingId: string | undefined;
  if (trainingUuid) {
    const training = await Training.findOne({ uuid: trainingUuid, deletedAt: null });
    // Not in this project reads as absent: a run elsewhere is not verified to exist.
    if (!training || training.projectId !== projectId) throw new BadRequestError('The source run is not in this project');
    trainingId = training._id.toString();
  } else if (epochUuid) {
    // An epoch belongs to one run: a result that names only its epoch came from that run, when it is in this project.
    const owner = await Epoch.findOne({ epoch_uuid: epochUuid, deletedAt: null });
    const training = owner && isValidObjectId(owner.trainingId) ? await Training.findOne({ _id: owner.trainingId, deletedAt: null }) : null;
    if (training && training.projectId === projectId) trainingId = training._id.toString();
  }
  return { ...(trainingId ? { trainingId } : {}), ...(epochUuid ? { epochUuid } : {}), ...(epoch !== undefined ? { epoch } : {}) };
}

/**
 * The project a result is for: the one it names, else the project of the epoch it came from. A run's pipeline knows
 * the epoch it tested but need not know the project, and the epoch's project is the run's. A pipeline that sends a
 * result before its epoch exists names the project itself.
 */
async function projectRefOf(body: EvaluationBody): Promise<string> {
  if (body.projectId) return body.projectId;
  const epoch = body.source?.epochUuid ? await Epoch.findOne({ epoch_uuid: body.source.epochUuid, deletedAt: null }) : null;
  const training = epoch && isValidObjectId(epoch.trainingId) ? await Training.findOne({ _id: epoch.trainingId, deletedAt: null }) : null;
  // An epoch that is not known, one with no project, and one in a project the caller cannot read all read the same
  // (the next step answers a project the caller cannot read with this very message), so none is verified to exist.
  if (!training?.projectId) throw new NotFoundError('Project not found');
  return training.projectId;
}

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

/**
 * Take the evaluation a correction replaces, so that exactly one live correction can: it must be live, in this
 * project, on the same suite and the same checkpoint (a correction of another model is a different result, not a
 * correction), and not already replaced. From then on it is never ranked or published; its row stays as an attempt.
 */
async function claimCorrection(
  supersedesId: string,
  projectId: string,
  correctionId: string,
  suiteId: string | undefined,
  key: string | undefined
): Promise<{ evaluation: IEvaluation; wasPublished: boolean }> {
  const earlier = isValidObjectId(supersedesId) ? await Evaluation.findOne({ _id: supersedesId, projectId, deletedAt: null }) : null;
  if (!earlier) throw new BadRequestError('The evaluation to supersede is not in this project');
  if (earlier.suite?.id !== suiteId) throw new BadRequestError('A correction must be on the same suite as the result it replaces');
  if (earlier.checkpointKey !== key) throw new BadRequestError('A correction must be of the same checkpoint as the result it replaces');
  if (earlier.supersededById) throw new ConflictError('That result is already replaced by another correction. Trash that one first.');
  const claimed = await Evaluation.findOneAndUpdate(
    { _id: earlier._id, supersededById: { $exists: false } },
    { $set: { supersededById: correctionId }, $unset: { publishedAt: 1, publishedBy: 1 } },
    { returnDocument: 'before' }
  );
  if (!claimed) throw new ConflictError('That result is already replaced by another correction. Trash that one first.');
  return { evaluation: claimed, wasPublished: Boolean(claimed.publishedAt) };
}

/**
 * Make an unranked result rankable on a suite by copying it into a new evaluation.
 *
 * The evaluation it is copied from is never touched: its results are copied as they are, the new evaluation's
 * `source` records the run, the epoch and the evaluation it came from, and the verdict is computed like any other. A
 * result recorded without a suite carries no checkpoint identity and no sample counts, so the person promoting supplies
 * both; what they supply is theirs to vouch for, and the provenance says it was promoted rather than recorded. Promoting
 * the same evaluation onto the same suite again returns the first; a different checkpoint or different counts for it are
 * a conflict until that one is trashed.
 */
export async function promoteEvaluation(
  userId: string | undefined,
  body: PromoteEvaluationBody
): Promise<{ evaluation: EvaluationView; created: boolean }> {
  const actor = requireActor(userId);
  const original = isValidObjectId(body.evaluationId) ? await Evaluation.findOne({ _id: body.evaluationId, deletedAt: null }) : null;
  // A stranger, or someone who may not manage its project, is told only that it is not found.
  const projectRef = original?.projectId;
  if (!original || !projectRef || !isValidObjectId(projectRef)) throw new NotFoundError('Evaluation not found');
  const { project, projectId } = await writableProject(projectRef, actor, 'manage').catch(error => {
    if (error instanceof NotFoundError) throw new NotFoundError('Evaluation not found');
    throw error;
  });
  requireCheckpointStorage(project, body.checkpoint);
  if (original.status !== 'completed') throw new ConflictError('A failed evaluation has no results to promote.');
  if (original.suite?.slug === body.suite.slug && original.suite.version === body.suite.version) {
    throw new ConflictError('This result was already judged on that suite.');
  }

  const source = {
    ...(original.source?.trainingId ? { trainingId: original.source.trainingId } : {}),
    ...(original.source?.epochUuid ? { epochUuid: original.source.epochUuid } : {}),
    ...(original.source?.epoch !== undefined ? { epoch: original.source.epoch } : {}),
    evaluationId: original._id.toString()
  };

  const existing = await Evaluation.findOne({
    projectId,
    deletedAt: null,
    'source.evaluationId': source.evaluationId,
    'suite.slug': body.suite.slug,
    'suite.version': body.suite.version
  });
  if (existing) return { evaluation: toView(replayOfPromotion(existing, body), true), created: false };

  const executedAt = original.executedAt ?? original.receivedAt;
  const effective = {
    projectId,
    suite: body.suite,
    checkpoint: body.checkpoint,
    source,
    status: 'completed' as const,
    results: original.results,
    sampleCounts: body.sampleCounts,
    provenance: { promoted: { evaluationId: source.evaluationId, uuid: original.uuid, by: actor } },
    executedAt
  };
  const { suite, report, key } = await judge(effective as unknown as EvaluationBody, actor, true);
  const receivedAt = new Date();

  let created: IEvaluation;
  try {
    created = await Evaluation.create({
      uuid: randomUUID(),
      projectId,
      ownerId: actor,
      checkpoint: body.checkpoint,
      checkpointKey: key,
      source,
      suite: { id: suite!._id.toString(), slug: suite!.slug, version: suite!.version, digest: suite!.digest },
      status: 'completed',
      results: effective.results,
      sampleCounts: body.sampleCounts,
      evidence: {
        kind: 'attested',
        by: actor,
        at: receivedAt,
        evaluationId: source.evaluationId,
        claims: { checkpoint: body.checkpoint, sampleCounts: body.sampleCounts }
      },
      provenance: effective.provenance,
      executedAt,
      receivedAt,
      validation: report,
      contentHash: contentHashOf(effective)
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    // A concurrent promote of the same result onto the same suite won the unique index: answer with its copy.
    const winner = await Evaluation.findOne({ projectId, deletedAt: null, 'source.evaluationId': source.evaluationId, 'suite.id': suite!._id.toString() });
    if (!winner) throw error;
    return { evaluation: toView(replayOfPromotion(winner, body), true), created: false };
  }
  await withdrawSuperseded(created, project, actor);
  await touchProjectActivity(projectId);
  invalidatePublic();
  return { evaluation: toView(created, true), created: true };
}

/**
 * What a repeated promotion of the same evaluation onto the same suite returns. The same checkpoint and counts
 * is a retry and gets the stored copy; anything else is a different claim, refused until that evaluation is
 * trashed, so changed numbers are never silently dropped.
 */
function replayOfPromotion(existing: IEvaluation, body: PromoteEvaluationBody): IEvaluation {
  if (existing.checkpointKey !== checkpointKey(body.checkpoint)) {
    throw new ConflictError('This result was already promoted onto that suite with a different checkpoint. Trash that evaluation to promote it again.');
  }
  if (!sameCounts(existing.sampleCounts, body.sampleCounts)) {
    throw new ConflictError('This result was already promoted onto that suite with different sample counts. Trash that evaluation to promote it again.');
  }
  return existing;
}

function sameCounts(stored: Record<string, number> | undefined, sent: Record<string, number>): boolean {
  const keys = Object.keys(sent);
  return !!stored && keys.length === Object.keys(stored).length && keys.every(key => stored[key] === sent[key]);
}

function sameResult(existing: IEvaluation, contentHash: string): IEvaluation {
  if (existing.contentHash !== contentHash) {
    throw new ConflictError(`An evaluation with uuid ${existing.uuid} already exists with different content. Results never change: send a new uuid, or set supersedesId.`);
  }
  return existing;
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

export interface LeaderboardView {
  suite: {
    slug: string;
    version: number;
    name: string;
    digest: string;
    headline: { key: string; direction: 'max' | 'min'; unit?: string };
  };
  selection: 'latest-eligible-completed';
  /** the pool that was ranked: evaluations of this suite version the caller may read */
  scope: { candidates: number; truncated: boolean };
  entries: unknown[];
  unranked: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
  unrankedPagination: { page: number; limit: number; total: number; pages: number };
}

/**
 * The ranking of one suite version, over the evaluations the caller may read. Rank is a position within that
 * pool, and the pool is reported, so a rank is never read as a standing among everything ever run.
 */
export async function suiteLeaderboard(
  slug: string,
  version: number | 'latest',
  userId: string | undefined,
  query: SuiteLeaderboardQuery = { ...DEFAULT_LEADERBOARD_PAGE, unrankedPage: 1 }
): Promise<LeaderboardView> {
  const suite = await readableSuite(slug, version, userId);
  const scope = await evaluationScope(userId);
  const where = {
    'suite.id': suite._id.toString(),
    deletedAt: null,
    checkpointKey: { $exists: true },
    ...(query.evidence ? { 'validation.evidence': query.evidence } : {})
  };
  // Where the caller can only read, the board holds what is published there: the rows a public board would show.
  const pool = [
    ...(await leaderboardPool({ ...where, projectId: { $in: scope.full } })),
    ...(await leaderboardPool({ ...where, projectId: { $in: scope.published } }, { publishedOnly: true }))
  ];

  const candidates: Candidate[] = pool.map((row) => ({
    id: row._id.toString(),
    attempts: row.attempts,
    checkpointKey: row.checkpointKey!,
    projectId: row.projectId,
    status: row.status,
    state: row.validation.state,
    scores: row.validation.scores,
    receivedAt: row.receivedAt
  }));
  const board = buildLeaderboard(suite.protocol, candidates);
  const rankedPage = leaderboardPage(board.entries, query);
  const unrankedPage = leaderboardPage(board.unranked, { ...query, page: query.unrankedPage });

  const byId = new Map(pool.map((row) => [row._id.toString(), row]));
  const projectIds = [...new Set(pool.map((row) => row.projectId))].filter((id) => isValidObjectId(id));
  const projects = await Project.find({ _id: { $in: projectIds.map((id) => new Types.ObjectId(id)) } })
    .select('name slug')
    .lean();
  const named = new Map(
    projects.map((project) => [
      project._id.toString(),
      { _id: project._id.toString(), name: project.name, slug: project.slug }
    ])
  );

  const describe = (id: string) => {
    const row = byId.get(id)!;
    return {
      uuid: row.uuid,
      checkpoint: row.checkpoint,
      project: named.get(row.projectId),
      evidenceLevel: row.validation.evidence ?? 'none',
      receivedAt: row.receivedAt,
      sampleCounts: row.sampleCounts
    };
  };
  const metric = suite.protocol.metrics.find((item) => item.headline)!;
  return {
    suite: {
      slug: suite.slug,
      version: suite.version,
      name: suite.name,
      digest: suite.digest,
      headline: { key: metric.key, direction: metric.direction, ...(metric.unit ? { unit: metric.unit } : {}) }
    },
    selection: board.selection,
    scope: { candidates: pool.reduce((count, row) => count + row.attempts, 0), truncated: false },
    pagination: rankedPage.pagination,
    unrankedPagination: unrankedPage.pagination,
    entries: rankedPage.rows.map((entry) => ({ ...entry, ...describe(entry.evaluationId) })),
    unranked: unrankedPage.rows.map((row) => ({
      ...row,
      ...describe(row.evaluationId),
      reasons: byId.get(row.evaluationId)!.validation.reasons
    }))
  };
}
