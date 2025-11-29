import mongoose, { Document, Schema } from 'mongoose';

export interface IEpochVisualization extends Document {
  epoch_uuid: string;
  visualization_uuid: string;
  filename: string;
  type: string;
  minioFileId: string;
  uploadedAt: Date;
  metadata?: any;
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
    minioFileId: {
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

// Compound indexes for querying
EpochVisualizationSchema.index({ epoch_uuid: 1, type: 1 });
EpochVisualizationSchema.index({ epoch_uuid: 1, uploadedAt: -1 });

export default mongoose.model<IEpochVisualization>('epoch_visualization', EpochVisualizationSchema);
