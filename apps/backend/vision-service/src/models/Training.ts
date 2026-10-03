import mongoose, { Document, Schema, Types } from 'mongoose';

export interface DatasetReference {
  source: 'visin' | 'hf' | 'other';
  id?: string;
  name: string;
  revision?: string;
}

/** A model checkpoint kept elsewhere, pinned to the commit the run produced. */
export interface ModelReference {
  _id: Types.ObjectId;
  provider: 'hf';
  kind: 'model';
  repo: string;
  /** a full commit hash, never a branch: a run from last year must still name the same bytes */
  revision: string;
  path?: string;
  epoch?: number;
  /** a demo Space on the Hub where anyone can try the model: `org/name` */
  space?: string;
  addedAt: Date;
}

export interface ITraining extends Document {
  /** Absent on legacy records; never inferred from the first editor. */
  ownerId?: string;
  _id: Types.ObjectId;
  uuid: string;
  name: string;
  description?: string;
  /** the researcher's own commentary on the run, apart from what the run is */
  notes?: string;
  datasetId?: string;
  dataset?: DatasetReference;
  models?: Types.DocumentArray<ModelReference>;
  /** what the run was started from: code, command, packages, machine */
  provenance?: Record<string, unknown>;
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
    notes: { type: String, maxlength: 5000 },
    dataset: { type: new Schema({
      source: { type: String, enum: ['visin', 'hf', 'other'], required: true },
      id: String, name: { type: String, required: true }, revision: String
    }, { _id: false }) },
    models: { type: [new Schema({
      provider: { type: String, enum: ['hf'], required: true },
      kind: { type: String, enum: ['model'], required: true },
      repo: { type: String, required: true },
      revision: { type: String, required: true },
      path: String,
      epoch: Number,
      space: String,
      addedAt: { type: Date, default: Date.now }
    })], default: undefined },
    provenance: { type: Schema.Types.Mixed },
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
