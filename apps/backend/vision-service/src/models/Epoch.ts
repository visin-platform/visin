import mongoose, { Document, Schema } from 'mongoose';

export interface IEpoch extends Document {
  trainingId: string;
  training_uuid: string;
  epoch_uuid: string;
  epoch: number;
  timestamp: Date;
  results: any;
  learning_rate?: number;
  epoch_time?: number;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const EpochSchema: Schema = new Schema(
  {
    trainingId: {
      type: String,
      required: true,
      index: true
    },
    training_uuid: {
      type: String,
      required: true,
      index: true
    },
    epoch_uuid: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    epoch: {
      type: Number,
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      required: true
    },
    results: {
      type: Schema.Types.Mixed,
      required: true
    },
    learning_rate: {
      type: Number
    },
    epoch_time: {
      type: Number
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

// Compound index for querying epochs by training
EpochSchema.index({ trainingId: 1, epoch: 1 });
EpochSchema.index({ training_uuid: 1, epoch: 1 });

// Index for sorting by timestamp
EpochSchema.index({ timestamp: -1 });

export default mongoose.model<IEpoch>('training_epoch', EpochSchema);
