import mongoose, { Schema } from 'mongoose';

/** The shape below; a pair whose stored disagreements are of another version has them rebuilt. */
export const DISAGREEMENTS_VERSION = 2;

export interface DisagreementValue {
  field: string;
  a: string;
  b: string;
  reference?: string;
}

/**
 * One sample on which two judges gave different values for at least one field, kept per compared pair so the
 * disagreement browser pages and filters with indexed queries instead of joining two runs on every request. Only what
 * is filtered on is kept: the sample itself is read from its runs for the page being shown, so nothing is copied.
 * Built once from the runs, which are immutable once complete, and removed with the pair.
 */
export interface IJudgeDisagreement {
  /** the JudgePair it belongs to */
  pair: string;
  sampleId: string;
  class?: string;
  size?: string;
  role?: string;
  /** the fields that differ, with both values and the reference's */
  values: DisagreementValue[];
}

const schema = new Schema<IJudgeDisagreement>({
  pair: { type: String, required: true },
  sampleId: { type: String, required: true },
  class: String,
  size: String,
  role: String,
  values: {
    type: [new Schema<DisagreementValue>({ field: { type: String, required: true }, a: { type: String, required: true }, b: { type: String, required: true }, reference: String }, { _id: false })],
    required: true
  }
}, { versionKey: false });

// One row per sample of a pair: a rebuild that meets rows already written is a no-op.
schema.index({ pair: 1, sampleId: 1 }, { unique: true });
// A page of one field's disagreements, in sample order.
schema.index({ pair: 1, 'values.field': 1, sampleId: 1 });

export default mongoose.model<IJudgeDisagreement>('judge_disagreement', schema);
