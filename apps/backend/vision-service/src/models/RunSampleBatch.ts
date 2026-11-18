import mongoose, { Schema } from 'mongoose';
import type { RunSampleInput } from '../validation/runSampleSchemas';

/** The complete payload is durable before a run reserves it, so a retry or sweeper can finish an interrupted write. */
export interface IRunSampleBatch {
  _id: string;
  trainingId: string;
  projectId: string;
  samples: RunSampleInput[];
}

const schema = new Schema<IRunSampleBatch>({
  _id: { type: String, required: true },
  trainingId: { type: String, required: true, index: true },
  projectId: { type: String, required: true },
  samples: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true });

export default mongoose.model<IRunSampleBatch>('run_sample_batch', schema);
