import { Schema, model, Document, Types } from 'mongoose';
import { IMaskMeta } from './LabelImage';

export interface ITaskLayer {
  set: string;
  imageId: Types.ObjectId;
}

export interface ITaskMaskMap {
  imageId: Types.ObjectId; // the idmap LabelImage
  masks: IMaskMeta[];
}

export interface ILabelTask extends Document {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  labelImageId: Types.ObjectId; // the frame
  order: number;
  stratum?: string;
  payload?: {
    layers?: ITaskLayer[];
    maskMap?: ITaskMaskMap;
  };
  answersCount: number;
  answeredBy: string[]; // userIds — lets `next` exclude in one query
  leasedBy?: string; // userId
  leaseExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LabelTaskSchema = new Schema<ILabelTask>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'LabelJob', required: true },
    labelImageId: { type: Schema.Types.ObjectId, ref: 'LabelImage', required: true },
    order: { type: Number, required: true },
    stratum: { type: String },
    payload: {
      type: {
        _id: false,
        layers: {
          type: [
            {
              _id: false,
              set: { type: String, required: true },
              imageId: { type: Schema.Types.ObjectId, required: true }
            }
          ],
          default: undefined
        },
        maskMap: {
          type: {
            _id: false,
            imageId: { type: Schema.Types.ObjectId, required: true },
            masks: { type: [Schema.Types.Mixed], default: [] }
          },
          default: undefined
        }
      },
      default: undefined
    },
    answersCount: { type: Number, default: 0 },
    answeredBy: { type: [String], default: [] },
    leasedBy: { type: String },
    leaseExpiresAt: { type: Date }
  },
  { timestamps: true }
);

LabelTaskSchema.index({ jobId: 1, order: 1 });
// `next` picks: unanswered-by-user, answersCount < K, no live lease.
LabelTaskSchema.index({ jobId: 1, answersCount: 1, leaseExpiresAt: 1 });

export const LabelTask = model<ILabelTask>('LabelTask', LabelTaskSchema);
