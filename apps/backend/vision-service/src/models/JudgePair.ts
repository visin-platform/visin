import mongoose, { Schema } from 'mongoose';

interface IJudgePair {
  evaluationA: string;
  evaluationB: string;
  suiteId: string;
  referenceEvaluationId?: string;
  results: Record<string, unknown>;
  /** every disagreement of the pair is stored (JudgeDisagreement) */
  disagreementsReady?: boolean;
  /** the shape they were stored in (DISAGREEMENTS_VERSION) */
  disagreementsVersion?: number;
}

const schema = new Schema<IJudgePair>({
  evaluationA: { type: String, required: true },
  evaluationB: { type: String, required: true },
  suiteId: { type: String, required: true },
  referenceEvaluationId: { type: String },
  results: { type: Schema.Types.Mixed, required: true },
  disagreementsReady: Boolean,
  disagreementsVersion: Number
}, { timestamps: true });
schema.index({ evaluationA: 1, evaluationB: 1, suiteId: 1 }, { unique: true });

export default mongoose.model<IJudgePair>('judge_pair', schema);
