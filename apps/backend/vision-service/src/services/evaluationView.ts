import { type IEvaluation } from '../models/Evaluation';
import { type ValidationReport } from './evaluationEligibility';

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
export type Reader = 'member' | 'public';

/** What a public reader of a published result is told of its evidence: never who vouched for it. */
const publicEvidence = (evidence: IEvaluation['evidence']): IEvaluation['evidence'] => {
  if (evidence?.kind !== 'attested') return evidence;
  const { by: _by, ...rest } = evidence;
  return rest as IEvaluation['evidence'];
};

/** The evaluator is the only part of the run's provenance a public reader is shown: no host, command or environment. */
const publicProvenance = (provenance: IEvaluation['provenance']): IEvaluation['provenance'] =>
  provenance?.evaluator ? { evaluator: provenance.evaluator } : undefined;

export const toView = (evaluation: IEvaluation, full: boolean, reader: Reader = 'member'): EvaluationView => ({
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
