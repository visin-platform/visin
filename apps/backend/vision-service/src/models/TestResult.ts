import mongoose, { Document, Schema } from 'mongoose';

export interface ITestResult extends Document {
  trainingId?: string;
  projectId?: string;
  timestamp: Date;
  epoch: number;
  epoch_uuid: string;
  test_uuid: string;
  test_results: {
    [condition: string]: {
      [className: string]: {
        iou: number;
        precision: number;
        recall: number;
        f1_score: number;
        ap: number;
      };
    };
  };
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const TestResultSchema: Schema = new Schema(
  {
    trainingId: { type: String, index: true },
    projectId: { type: String, index: true },
    timestamp: {
      type: Date,
      required: true,
      index: true
    },
    epoch: {
      type: Number,
      required: true,
      index: true
    },
    epoch_uuid: {
      type: String,
      required: true,
      index: true
    },
    test_uuid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    test_results: {
      type: Schema.Types.Mixed,
      required: true
    },
    deletedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

TestResultSchema.index({ projectId: 1, trainingId: 1, deletedAt: 1, timestamp: -1 });

// Compound index for querying by epoch
TestResultSchema.index({ epoch: 1, epoch_uuid: 1 });

// Index for sorting by timestamp
TestResultSchema.index({ timestamp: -1 });

export default mongoose.model<ITestResult>('test_result', TestResultSchema);