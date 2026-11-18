import mongoose, { Schema } from 'mongoose';

/**
 * One sample on which two judges gave different values for one field, kept per compared pair so the disagreement
 * browser pages and filters with indexed queries instead of joining two runs of 145,000 samples on every request.
 * Built once from the runs, which are immutable once complete, and removed with the pair.
 */
export interface IJudgeDisagreement {
  /** the JudgePair it belongs to */
  pair: string;
  field: string;
  sampleId: string;
  class?: string;
  size?: string;
  role?: string;
  a: string;
  b: string;
  reference?: string;
  /** what the browser shows: the sample's attributes and both judges' decisions and replies */
  sample: Record<string, unknown>;
}

const schema = new Schema<IJudgeDisagreement>({
  pair: { type: String, required: true },
  field: { type: String, required: true },
  sampleId: { type: String, required: true },
  class: String,
  size: String,
  role: String,
  a: { type: String, required: true },
  b: { type: String, required: true },
  reference: String,
  sample: { type: Schema.Types.Mixed, required: true }
}, { versionKey: false });

// A page in sample order, and a rebuild that meets rows already written is a no-op.
schema.index({ pair: 1, field: 1, sampleId: 1 }, { unique: true });

export default mongoose.model<IJudgeDisagreement>('judge_disagreement', schema);
