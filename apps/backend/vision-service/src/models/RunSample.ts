import mongoose, { Schema, type Document } from 'mongoose';

export interface IRunSample extends Document {
  trainingId: string;
  projectId: string;
  sampleId: string;
  attrs: Record<string, unknown>;
  fields: Record<string, string>;
  abstained?: boolean;
  parseFailed?: boolean;
  raw?: string;
  latencyMs?: number;
}

const schema = new Schema<IRunSample>({
  trainingId: { type: String, required: true },
  projectId: { type: String, required: true },
  sampleId: { type: String, required: true },
  attrs: { type: Schema.Types.Mixed, required: true },
  fields: { type: Schema.Types.Mixed, required: true },
  abstained: Boolean,
  parseFailed: Boolean,
  raw: String,
  latencyMs: Number
}, { timestamps: true });

schema.index({ trainingId: 1, sampleId: 1 }, { unique: true });
schema.index({ projectId: 1, trainingId: 1 });

export default mongoose.model<IRunSample>('run_sample', schema);
