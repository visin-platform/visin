import { BadRequestError, ConflictError } from '@visin/backend-core';
import Evaluation from '../models/Evaluation';
import Training from '../models/Training';
import type { EvaluationBody } from '../validation/evaluationSchemas';
import { readableSuite } from './suiteService';
import { sampleDigest } from './sampleDigest';
import { scoreSampleRun } from './sampleScoring';
import { evaluationScope, readerVisible } from './evaluationScope';
import { checkProjectAccess } from './projectAccessService';

/** Replace writer-supplied aggregates with scores from an immutable, completed sample run. */
export async function prepareSampleEvaluation(body: EvaluationBody, actor: string, projectId: string): Promise<{ body: EvaluationBody; samplesDigest?: string }> {
  if (!body.suite) return { body };
  const suite = await readableSuite(body.suite.slug, body.suite.version, actor);
  if (!suite.protocol.samples) return { body };
  if (!body.source?.trainingUuid || !body.checkpoint || body.status !== 'completed') {
    throw new BadRequestError('Sample evaluations need a completed inference run and checkpoint');
  }
  const run = await Training.findOne({ uuid: body.source.trainingUuid, projectId, deletedAt: null });
  if (!run || run.kind !== 'inference' || run.status !== 'completed' || run.suite?.digest !== suite.digest || run.suite.slug !== suite.slug || run.suite.version !== suite.version) {
    throw new BadRequestError('Source must be a completed inference run pinned to this suite and project');
  }
  const trainingId = run._id.toString();
  const digest = await sampleDigest(trainingId);
  const needsReference = suite.protocol.metrics.some(metric => /^(?:error|fa|fr):/.test(metric.derivation ?? ''));
  let referenceTrainingId: string | undefined;
  if (body.checkpoint.kind === 'human') {
    if (!suite.protocol.reference || digest !== suite.protocol.reference.samplesDigest) throw new ConflictError('Human samples do not match the suite reference digest');
    referenceTrainingId = trainingId;
  } else if (needsReference) {
    const scope = await evaluationScope(actor);
    const reference = suite.protocol.reference && await Evaluation.findOne({
      'suite.id': suite._id.toString(), 'checkpoint.kind': 'human',
      samplesDigest: suite.protocol.reference.samplesDigest, status: 'completed', deletedAt: null,
      $or: [{ projectId: { $in: scope.full } }, { projectId: { $in: scope.published }, ...readerVisible }]
    }).select('source projectId');
    referenceTrainingId = reference?.source?.trainingId;
    if (!referenceTrainingId || !reference) throw new ConflictError('The suite reference evaluation is not available');
    const liveReference = await Training.findOne({ _id: referenceTrainingId, projectId: reference.projectId, deletedAt: null, status: 'completed' });
    if (!liveReference || !(await checkProjectAccess(actor, liveReference.projectId)) || await sampleDigest(referenceTrainingId) !== suite.protocol.reference!.samplesDigest) {
      throw new ConflictError('The reference samples no longer match the suite digest');
    }
  }
  const scored = await scoreSampleRun(trainingId, suite.protocol, referenceTrainingId);
  return { body: { ...body, results: scored.results, sampleCounts: scored.sampleCounts }, samplesDigest: digest };
}
