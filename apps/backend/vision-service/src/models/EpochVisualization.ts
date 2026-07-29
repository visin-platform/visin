import mongoose, { Document, Schema } from 'mongoose';
import { mirrorLegacyFileIdKeys } from '../legacyMinioCompat';

export interface IEpochVisualization extends Document {
  epoch_uuid: string;
  visualization_uuid: string;
  filename: string;
  type: string;
  fileId: string;
  uploadedAt: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const EpochVisualizationSchema: Schema = new Schema(
  {
    epoch_uuid: {
      type: String,
      required: true,
      index: true
    },
    visualization_uuid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    filename: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true,
      index: true
    },
    fileId: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Serialized documents also carry the legacy `minioFileId` key for one
// deprecation cycle — see legacyMinioCompat.ts.
EpochVisualizationSchema.set('toJSON', { transform: mirrorLegacyFileIdKeys });
EpochVisualizationSchema.set('toObject', { transform: mirrorLegacyFileIdKeys });

// Compound indexes for querying
EpochVisualizationSchema.index({ epoch_uuid: 1, type: 1 });
EpochVisualizationSchema.index({ epoch_uuid: 1, uploadedAt: -1 });

export default mongoose.model<IEpochVisualization>('epoch_visualization', EpochVisualizationSchema);
