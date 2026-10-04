import mongoose, { Document, Schema, Types } from 'mongoose';
import { DATASET_SOURCES, MODEL_LINK_PATHS, MODEL_LINK_PROVIDERS, type DatasetSourceKind, type ModelLink } from '../services/sourceRegistry';

export interface DatasetReference {
  source: DatasetSourceKind;
  id?: string;
  name: string;
  /** a Hub commit for a dataset kept on the Hub, else the zip's upload time */
  revision?: string;
  /** the zip kept on Visin, for a dataset that is also on the Hub: its upload time */
  archiveRevision?: string;
}

/**
 * A model checkpoint kept elsewhere, pinned to the revision the run produced: a full commit, never a branch, so a run
 * from last year still names the same bytes. Which fields it has beyond these is the provider's own (`ModelLink`).
 */
export type ModelReference = ModelLink & {
  _id: Types.ObjectId;
  addedAt: Date;
};

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
      source: { type: String, enum: DATASET_SOURCES, required: true },
      id: String, name: { type: String, required: true }, revision: String, archiveRevision: String
    }, { _id: false }) },
    // The provider's own fields (a Hub link's repo and revision) are added by it; its schema is what requires them.
    models: { type: [new Schema({
      provider: { type: String, enum: MODEL_LINK_PROVIDERS, required: true },
      kind: { type: String, enum: ['model'], required: true },
      ...MODEL_LINK_PATHS,
      epoch: Number,
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
