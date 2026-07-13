import mongoose, { Document, Schema } from 'mongoose';

export interface IConfig extends Document {
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
