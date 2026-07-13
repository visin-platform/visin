import mongoose, { Document, Schema } from 'mongoose';

export interface IDatasetAnalysis extends Document {
  dataset: string; // 'waymo', 'zod', etc.
  size?: string; // Human-readable size (e.g., "1.2 GB", "500 MB")
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
