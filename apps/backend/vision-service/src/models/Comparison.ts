import mongoose, { Document, Schema } from 'mongoose';

export interface IComparison extends Document {
  uuid: string;
  name: string;
  description?: string;
  type: 'trainings' | 'tests' | 'benchmarks' | 'epochs';
  itemIds: string[]; // Array of IDs to compare (training IDs, test IDs, etc.)
  projectId?: string; // Project this comparison belongs to (optional for global comparisons)
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const ComparisonSchema: Schema = new Schema(
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
    type: {
      type: String,
      enum: ['trainings', 'tests', 'benchmarks', 'epochs'],
      required: true,
      index: true
    },
    itemIds: [{
      type: String,
      required: true
    }],
    projectId: {
      type: String,
      index: true
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
ComparisonSchema.index({ name: 'text', description: 'text' });

// Index for sorting
ComparisonSchema.index({ createdAt: -1 });
ComparisonSchema.index({ updatedAt: -1 });

// Index by type for filtering
ComparisonSchema.index({ type: 1, createdAt: -1 });

export default mongoose.model<IComparison>('comparison', ComparisonSchema);