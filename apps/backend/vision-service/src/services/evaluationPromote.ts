import { randomUUID } from 'crypto';
import { ConflictError, NotFoundError } from '@visin/backend-core';
import { isValidObjectId } from 'mongoose';
import Evaluation, { type IEvaluation } from '../models/Evaluation';
import type { EvaluationBody, PromoteEvaluationBody } from '../validation/evaluationSchemas';
import { checkpointKey } from './checkpointIdentity';
import { invalidatePublic } from './publicCache';
import { requireCheckpointStorage } from './sourceRegistry';
import { contentHashOf } from './evaluationContent';
import { touchProjectActivity } from './projectActivity';
import { EvaluationView, toView } from './evaluationView';
import { requireActor, withdrawSuperseded, writableProject, judge } from './evaluationWriteSupport';

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
