import mongoose, { Document, Schema } from 'mongoose';

export interface IDatasetAnalysis extends Document {
  dataset: string; // 'waymo', 'zod', etc.
  fileId?: string; // file-service path of the uploaded dataset archive
  size?: string; // Human-readable size, derived from the uploaded file
  data: Record<string, unknown>; // Dynamic JSON structure
  createdAt: Date;
  updatedAt: Date;
}

const DatasetAnalysisSchema: Schema = new Schema(
  {
    dataset: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    // Always a `datasets/<uuid>/<filename>` path handed out by
    // POST /analysis/upload-url — see `assertDatasetFileId`.
    fileId: {
      type: String,
      trim: true
    },
    size: {
      type: String,
      trim: true
    },
    data: {
      type: Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Indexes for performance
DatasetAnalysisSchema.index({ dataset: 1, createdAt: -1 });
DatasetAnalysisSchema.index({ createdAt: -1 });

export default mongoose.model<IDatasetAnalysis>('dataset_analysis', DatasetAnalysisSchema);
