import mongoose, { Document, Schema } from 'mongoose';

export interface IConfig extends Document {
  /** Absent on legacy records; never inferred from the first editor. */
  ownerId?: string;
  /** the project it belongs to, whose readers see it; absent only on configs from before projects owned them */
  projectId?: string;
  config_uuid: string;
  summary: string;
  config_data: Record<string, unknown>;
  config_name?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const ConfigSchema: Schema = new Schema(
  {
    ownerId: { type: String, immutable: true, index: true },
    projectId: { type: String, index: true },
    config_uuid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    summary: {
      type: String,
      required: true
    },
    config_data: {
      type: Schema.Types.Mixed,
      required: true
    },
    config_name: {
      type: String
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Index for sorting by creation date
ConfigSchema.index({ createdAt: -1 });

export default mongoose.model<IConfig>('training_config', ConfigSchema);
