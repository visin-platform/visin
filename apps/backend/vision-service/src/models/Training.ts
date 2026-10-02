import mongoose, { Document, Schema, Types } from 'mongoose';

export interface DatasetReference {
  source: 'visin' | 'hf' | 'other';
  id?: string;
  name: string;
  revision?: string;
}

export interface ITraining extends Document {
  /** Absent on legacy records; never inferred from the first editor. */
  ownerId?: string;
  _id: Types.ObjectId;
  uuid: string;
  name: string;
  description?: string;
  datasetId?: string;
  dataset?: DatasetReference;
  configId?: string;
  projectId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stalled';
  tags?: string[];
  lastSeenAt?: Date;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const TrainingSchema: Schema = new Schema(
  {
    ownerId: { type: String, immutable: true, index: true },
    uuid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    dataset: { type: new Schema({
      source: { type: String, enum: ['visin', 'hf', 'other'], required: true },
      id: String, name: { type: String, required: true }, revision: String
    }, { _id: false }) },
    datasetId: {
      type: String,
      index: true
    },
    configId: {
      type: String,
      index: true
    },
    projectId: {
      type: String,
      index: true
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'stalled'],
      default: 'pending',
      index: true
    },
    tags: [{
      type: String,
      trim: true,
      maxlength: 50
    }],
    lastSeenAt: { type: Date, index: true },
    startTime: {
      type: Date
    },
    endTime: {
      type: Date
    },
    metadata: {
      type: Schema.Types.Mixed
    },
    deletedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Index for searching
TrainingSchema.index({ name: 'text', description: 'text' });

// Index for sorting
TrainingSchema.index({ createdAt: -1 });
TrainingSchema.index({ updatedAt: -1 });

export default mongoose.model<ITraining>('training', TrainingSchema);
