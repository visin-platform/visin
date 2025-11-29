import mongoose, { Document, Schema } from 'mongoose';

export interface IDataset extends Document {
  uuid: string;
  name: string;
  description?: string;
  timestamp: Date;
  dataset_info?: any;
  annotations?: any;
  camera?: any;
  lidar?: any;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const DatasetSchema: Schema = new Schema(
  {
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
    timestamp: {
      type: Date,
      required: true
    },
    dataset_info: {
      type: Schema.Types.Mixed
    },
    annotations: {
      type: Schema.Types.Mixed
    },
    camera: {
      type: Schema.Types.Mixed
    },
    lidar: {
      type: Schema.Types.Mixed
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
DatasetSchema.index({ name: 'text', description: 'text' });

// Index for sorting by timestamp
DatasetSchema.index({ timestamp: -1 });
DatasetSchema.index({ updatedAt: -1 });

export default mongoose.model<IDataset>('training_dataset', DatasetSchema);
