import mongoose, { Document, Schema } from 'mongoose';

// Weather condition types
export const WEATHER_CONDITIONS = ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'] as const;
export type WeatherCondition = typeof WEATHER_CONDITIONS[number];

export interface IDatasetImage extends Document {
  filename: string;
  originalName: string;
  minioFileId: string; // MinIO storage path for original file
  minioThumbnailFileId?: string; // MinIO storage path for thumbnail
  datasetId: mongoose.Types.ObjectId; // Reference to dataset analysis
  categoryId: mongoose.Types.ObjectId; // Reference to ImageCategory
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags: string[];
  labels: string[]; // User quality labels like 'good_annotations', 'bad_annotations'
  weatherCondition?: WeatherCondition; // Weather condition
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const DatasetImageSchema: Schema = new Schema(
  {
    filename: {
      type: String,
      required: true
    },
    originalName: {
      type: String,
      required: true
    },
    minioFileId: {
      type: String,
      required: true
    },
    minioThumbnailFileId: {
      type: String,
      required: false
    },
    datasetId: {
      type: Schema.Types.ObjectId,
      ref: 'training_dataset', // Reference to Dataset model
      required: true
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'ImageCategory',
      required: true
    },
    title: {
      type: String,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    mimetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    width: Number,
    height: Number,
    tags: [
      {
        type: String,
        trim: true
      }
    ],
    labels: [
      {
        type: String,
        trim: true
      }
    ],
    weatherCondition: {
      type: String,
      enum: WEATHER_CONDITIONS,
      required: false
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
DatasetImageSchema.index({ datasetId: 1, categoryId: 1, createdAt: -1 });
DatasetImageSchema.index({ datasetId: 1, labels: 1 });
DatasetImageSchema.index({ tags: 1 }); // Index for tag filtering
DatasetImageSchema.index({ weatherCondition: 1 }); // Index for weather condition filtering
DatasetImageSchema.index({ createdAt: -1 }); // Index for sorting by creation date
DatasetImageSchema.index({ updatedAt: -1 }); // Index for sorting by update date
DatasetImageSchema.index({ title: 'text', description: 'text', tags: 'text' });

export default mongoose.model<IDatasetImage>('DatasetImage', DatasetImageSchema);