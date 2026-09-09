import mongoose, { Document, Schema } from 'mongoose';

export interface IDatasetImage extends Document {
  filename: string;
  originalName: string;
  fileId: string; // file-service storage path for the original file
  thumbnailFileId?: string; // file-service storage path for the thumbnail
  datasetId: mongoose.Types.ObjectId; // Reference to dataset analysis
  categoryId: mongoose.Types.ObjectId; // Reference to ImageCategory
  title?: string;
  description?: string;
  mimetype: string;
  size: number;
  width?: number;
  height?: number;
  tags: string[];
  labels: string[]; // User-defined quality labels, configured per project
  /**
   * Free-form condition this image was captured under. Open on purpose: images
   * arrive from ingest pipelines over the API, which cannot register a vocabulary
   * first. A project's taxonomy decorates whatever turns up; it never limits it.
   */
  condition?: string;
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
    fileId: {
      type: String,
      required: true
    },
    thumbnailFileId: {
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
    condition: {
      type: String,
      trim: true,
      maxlength: 100,
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
DatasetImageSchema.index({ fileId: 1 }); // createDatasetImage's duplicate check
DatasetImageSchema.index({ datasetId: 1, categoryId: 1, createdAt: -1 });
DatasetImageSchema.index({ datasetId: 1, labels: 1 });
DatasetImageSchema.index({ tags: 1 }); // Index for tag filtering
DatasetImageSchema.index({ datasetId: 1, condition: 1 }); // Index for condition filtering
DatasetImageSchema.index({ createdAt: -1 }); // Index for sorting by creation date
DatasetImageSchema.index({ updatedAt: -1 }); // Index for sorting by update date
DatasetImageSchema.index({ title: 'text', description: 'text', tags: 'text' });

export default mongoose.model<IDatasetImage>('DatasetImage', DatasetImageSchema);