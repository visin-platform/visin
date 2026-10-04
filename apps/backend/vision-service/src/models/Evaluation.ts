import mongoose, { Document, Schema } from 'mongoose';
import type { Checkpoint } from '../services/sourceRegistry';
import type { ValidationReport } from '../services/evaluationEligibility';
import type { Evidence } from '../validation/evaluationSchemas';

export type { Checkpoint } from '../services/sourceRegistry';

/** A manager's claim for a promoted result: what they supplied, by whom and when. Nothing was observed. */
export interface Attestation {
  kind: 'attested';
  by: string;
  at: Date;
  evaluationId: string;
  claims: { checkpoint: Checkpoint; sampleCounts: Record<string, number> };
}

/**
 * One execution of one checkpoint against one suite version (or, with no suite, an exploratory measurement),
 * with the raw results and the server's judgement of whether they can be ranked.
 *
 * Results are immutable once stored: a correction is a new evaluation that `supersedes` the old one.
 * Access follows the project, so nothing here is readable without it.
 */
export interface IEvaluation extends Document {
  /** the writer's id for it, unique within the project, so a retried upload is answered rather than doubled */
  uuid: string;
  projectId: string;
  /** who submitted it: with `contribute` on the project, only they may trash it */
  ownerId: string;
  checkpoint?: Checkpoint;
  /** `hf:<repo>@<commit>:<path>` or `sha256:<digest>`; evaluations of one key are the same model */
  checkpointKey?: string;
  /** where the checkpoint came from; says nothing about which bytes were scored */
  source?: { trainingId?: string; epochUuid?: string; epoch?: number; /** the evaluation it was copied from, when promoted */ evaluationId?: string };
  /** the suite version it was judged on; the digest is the protocol at that time */
  suite?: { id: string; slug: string; version: number; digest: string };
  status: 'completed' | 'failed';
  /** condition → class → metric, as the pipeline sent it; open, only the suite's metrics are read for ranking */
  results: Record<string, unknown>;
  sampleCounts?: Record<string, number>;
  /** what the evaluator reported observing (`kind: 'observed'`), or the claim of the manager who promoted it */
  evidence?: ({ kind: 'observed' } & Evidence) | Attestation;
  /** submitter-reported: evaluator, config, environment, seeds. Schema checks cannot prove it. */
  provenance?: Record<string, unknown>;
  /** when the writer says it ran */
  executedAt?: Date;
  /** when the server stored it; the writer's clock never decides which attempt is latest */
  receivedAt: Date;
  validation: ValidationReport;
  /**
   * Set when a manager chose to put this result on a public leaderboard. Publishing is a decision about one result,
   * never a consequence of the project or suite being public; the public views also re-check that they still are.
   */
  publishedAt?: Date;
  publishedBy?: string;
  /** Verified by a manager or an automated job using a manager's project credential. */
  verifiedAt?: Date;
  verifiedBy?: string;
  /** taken off the suite's public leaderboard by a manager of the suite's project, with their reason */
  hiddenAt?: Date;
  hiddenBy?: string;
  hiddenReason?: string;
  supersedesId?: string;
  /**
   * Set on an evaluation when a live correction replaces it. It stays stored and counted as an attempt, but is never
   * ranked or published again. Cleared when the correction is trashed.
   */
  supersededById?: string;
  /** digest of what the writer sent, to tell a retry from a different result under the same uuid */
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const EvaluationSchema = new Schema<IEvaluation>(
  {
    uuid: { type: String, required: true, immutable: true },
    projectId: { type: String, required: true, immutable: true },
    ownerId: { type: String, required: true, immutable: true },
    checkpoint: { type: Schema.Types.Mixed, immutable: true },
    checkpointKey: { type: String, immutable: true },
    source: { type: Schema.Types.Mixed, immutable: true },
    suite: { type: Schema.Types.Mixed, immutable: true },
    status: { type: String, enum: ['completed', 'failed'], required: true, immutable: true },
    results: { type: Schema.Types.Mixed, required: true, immutable: true },
    sampleCounts: { type: Schema.Types.Mixed, immutable: true },
    evidence: { type: Schema.Types.Mixed, immutable: true },
    provenance: { type: Schema.Types.Mixed, immutable: true },
    executedAt: { type: Date, immutable: true },
    receivedAt: { type: Date, required: true, immutable: true },
    validation: { type: Schema.Types.Mixed, required: true },
    supersedesId: { type: String, immutable: true },
    contentHash: { type: String, required: true, immutable: true },
    publishedAt: { type: Date },
    publishedBy: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
    hiddenAt: { type: Date },
    hiddenBy: { type: String },
    hiddenReason: { type: String, maxlength: 500 },
    supersededById: { type: String },
    deletedAt: { type: Date }
  },
  { timestamps: true, minimize: false }
);

// A retried upload cannot create a second row.
EvaluationSchema.index({ projectId: 1, uuid: 1 }, { unique: true });
// A leaderboard reads one suite version's live evaluations.
EvaluationSchema.index({ 'suite.id': 1, deletedAt: 1, receivedAt: -1 });
EvaluationSchema.index({ projectId: 1, deletedAt: 1, receivedAt: -1 });
EvaluationSchema.index({ checkpointKey: 1, projectId: 1 });
// What a run's checkpoints scored, and what an epoch's did: the run and epoch pages read these.
EvaluationSchema.index({ 'source.trainingId': 1, deletedAt: 1, receivedAt: -1 });
EvaluationSchema.index({ 'source.epochUuid': 1 });
// The public views read only what was published; only those rows are in the index.
EvaluationSchema.index({ publishedAt: 1, 'suite.id': 1 }, { partialFilterExpression: { publishedAt: { $exists: true } } });
// One live promotion of a test result per suite: two simultaneous promotes cannot both insert. A trashed copy does
// not count, so a wrong promotion can be trashed and made again.
EvaluationSchema.index(
  { projectId: 1, 'source.evaluationId': 1, 'suite.id': 1 },
  { unique: true, partialFilterExpression: { 'source.evaluationId': { $exists: true }, deletedAt: null } }
);

export default mongoose.model<IEvaluation>('evaluation', EvaluationSchema);
