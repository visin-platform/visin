import { Schema, model, Document, Types } from 'mongoose';
import type { SensorKey, SensorKind } from './LabelJob';

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

/** One projected point of a point sensor, in the camera frame's pixel space. */
export interface ITaskPoint {
  u: number;
  v: number;
  /** range, depth, intensity or RCS — whatever the sensor's file calls its reading */
  value?: number;
}

/** What one of the job's non-camera sensors shows on this frame. */
export interface ITaskSensor {
  key: SensorKey;
  kind: SensorKind;
  /** image sensors: the file to draw */
  fileId?: string;
  /** point sensors: the points themselves, copied from the dataset's JSON sidecar */
  points?: ITaskPoint[];
}

export interface ILabelTask extends Document {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  generation?: string;
  frame: ITaskFrame;
  order: number;
  stratum?: string;
  sensors?: ITaskSensor[];
  /** annotators who marked the frame done — what `redundancy` counts */
  answersCount: number;
  answeredBy: string[]; // userIds — lets `next` exclude in one query
  /** annotators who skipped it: not counted as done, but not offered to them again */
  skippedBy: string[];
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
    generation: String,
    frame: { type: TaskFrameSchema, required: true },
    order: { type: Number, required: true },
    stratum: { type: String },
    sensors: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          kind: { type: String, required: true },
          fileId: { type: String },
          points: { type: [{ _id: false, u: Number, v: Number, value: Number }], default: undefined }
        }
      ],
      default: undefined
    },
    answersCount: { type: Number, default: 0 },
    answeredBy: { type: [String], default: [] },
    skippedBy: { type: [String], default: [] },
    leasedBy: { type: String },
    leaseExpiresAt: { type: Date }
  },
  { timestamps: true }
);

LabelTaskSchema.index({ jobId: 1, order: 1 });
LabelTaskSchema.index({ jobId: 1, generation: 1, order: 1 }, { unique: true, partialFilterExpression: { generation: { $type: 'string' } } });
// `next` picks: unfinished by user, answersCount < K, no live lease.
LabelTaskSchema.index({ jobId: 1, answersCount: 1, leaseExpiresAt: 1 });

export const LabelTask = model<ILabelTask>('LabelTask', LabelTaskSchema, 'label_tasks');
