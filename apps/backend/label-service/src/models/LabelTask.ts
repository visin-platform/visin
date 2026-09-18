import { Schema, model, Document, Types } from 'mongoose';

export interface IMaskMeta {
  id: number;
  class: string;
  bbox?: number[]; // [x1, y1, x2, y2]
  [key: string]: unknown; // triage outcome, disagreement flags, scores, ...
}

/**
 * The frame a task shows, copied from its dataset when the task was created.
 *
 * Copied rather than referenced so that serving a task — which happens for every
 * frame a labeler sees — is one query here and never a call to dataset-service.
 * The dataset holds a claim on these files for as long as the job exists.
 */
export interface ITaskFrame {
  fileId: string;
  /** the path inside the dataset zip — what exports name the frame by */
  path: string;
  stem: string;
  width?: number;
  height?: number;
}

export interface ITaskLayer {
  set: string;
  fileId: string;
}

export interface ITaskMaskMap {
  fileId: string; // the id map
  masks: IMaskMeta[];
}

export interface ILabelTask extends Document {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  frame: ITaskFrame;
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

const TaskFrameSchema = new Schema<ITaskFrame>(
  {
    fileId: { type: String, required: true },
    path: { type: String, required: true },
    stem: { type: String, required: true },
    width: Number,
    height: Number
  },
  { _id: false }
);

const LabelTaskSchema = new Schema<ILabelTask>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'LabelJob', required: true },
    frame: { type: TaskFrameSchema, required: true },
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
              fileId: { type: String, required: true }
            }
          ],
          default: undefined
        },
        maskMap: {
          type: {
            _id: false,
            fileId: { type: String, required: true },
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

export const LabelTask = model<ILabelTask>('LabelTask', LabelTaskSchema, 'label_tasks');
