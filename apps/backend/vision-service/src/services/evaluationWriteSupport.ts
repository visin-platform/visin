import { atLeast, BadRequestError, ConflictError, ForbiddenError, NotFoundError, recordResourceEvent, UnauthorizedError, logger } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Epoch from '../models/Epoch';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import { type IProject } from '../models/Project';
import Training from '../models/Training';
import { type ISuite } from '../models/Suite';
import type { EvaluationBody } from '../validation/evaluationSchemas';
import { checkpointKey } from './checkpointIdentity';
import { exploratoryReport, validateEvaluation, type ValidationReport } from './evaluationEligibility';
import { isWithinTokenScope, permissionIgnoringKeyLimit, projectPermission, resolveProject } from './projectAccessService';
import { readableSuite } from './suiteService';

export const requireActor = (userId: string | undefined): string => {
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
export async function withdrawSuperseded(created: IEvaluation, project: { owner: IProject['owner'] }, actor: string): Promise<void> {
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

/**
 * A project the caller may add results to, resolved from an id or slug; refusals read the same as for a stranger.
 * `contribute` records a result; promoting someone else's old result into the ranking needs `manage`.
 */
export async function writableProject(projectRef: string, userId: string, needs: 'contribute' | 'manage' = 'contribute') {
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
export async function judge(body: EvaluationBody, userId: string, attested = false): Promise<Judged> {
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
export async function touchRun(source: IEvaluation['source']): Promise<void> {
  try {
    const now = new Date();
    if (source?.epochUuid) await Epoch.updateOne({ epoch_uuid: source.epochUuid, deletedAt: null }, { updatedAt: now });
    if (source?.trainingId && isValidObjectId(source.trainingId)) await Training.updateOne({ _id: source.trainingId }, { updatedAt: now });
  } catch (error) {
    logger.warn('Failed to update epoch/training timestamps', { error: (error as Error).message });
  }
}

export async function resolveSource(body: EvaluationBody, projectId: string): Promise<IEvaluation['source']> {
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
export async function projectRefOf(body: EvaluationBody): Promise<string> {
  if (body.projectId) return body.projectId;
  const epoch = body.source?.epochUuid ? await Epoch.findOne({ epoch_uuid: body.source.epochUuid, deletedAt: null }) : null;
  const training = epoch && isValidObjectId(epoch.trainingId) ? await Training.findOne({ _id: epoch.trainingId, deletedAt: null }) : null;
  // An epoch that is not known, one with no project, and one in a project the caller cannot read all read the same
  // (the next step answers a project the caller cannot read with this very message), so none is verified to exist.
  if (!training?.projectId) throw new NotFoundError('Project not found');
  return training.projectId;
}

/**
 * Take the evaluation a correction replaces, so that exactly one live correction can: it must be live, in this
 * project, on the same suite and the same checkpoint (a correction of another model is a different result, not a
 * correction), and not already replaced. From then on it is never ranked or published; its row stays as an attempt.
 */
export async function claimCorrection(
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

export function sameResult(existing: IEvaluation, contentHash: string): IEvaluation {
  if (existing.contentHash !== contentHash) {
    throw new ConflictError(`An evaluation with uuid ${existing.uuid} already exists with different content. Results never change: send a new uuid, or set supersedesId.`);
  }
  return existing;
}
