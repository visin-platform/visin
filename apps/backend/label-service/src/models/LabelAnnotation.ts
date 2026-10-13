import { Schema, model, Document, Types } from 'mongoose';

export const ANNOTATION_STATUSES = ['draft', 'done', 'skipped'] as const;
export type AnnotationStatus = (typeof ANNOTATION_STATUSES)[number];

/** Where an object came from: drawn by hand, accepted from a model, or from an imported file. */
export const OBJECT_SOURCES = ['human', 'model', 'import'] as const;
export type ObjectSource = (typeof OBJECT_SOURCES)[number];

export interface IBoxObject {
  /** chosen by the client and stable across edits */
  id: string;
  classKey: string;
  /** `[x, y, width, height]` in the camera frame's pixels */
  bbox: [number, number, number, number];
  source: ObjectSource;
  score?: number;
}

export interface IAnnotationMask {
  /** file-service id of an 8-bit grayscale PNG whose pixel value is the class's `maskIndex` (0 = unlabeled) */
  fileId: string;
  width: number;
  height: number;
  /** labeled pixels per `maskIndex`, counted when the mask was stored */
  pixels: Record<string, number>;
}

export interface ILabelAnnotation extends Document {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  jobId: Types.ObjectId;
  userId: string;
  userEmail: string;
  userName?: string;
  status: AnnotationStatus;
  objects: IBoxObject[];
  mask?: IAnnotationMask;
  elapsedMs?: number;
  doneAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LabelAnnotationSchema = new Schema<ILabelAnnotation>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'LabelTask', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'LabelJob', required: true },
    userId: { type: String, required: true },
    userEmail: { type: String, required: true, lowercase: true },
    userName: { type: String },
    status: { type: String, enum: ANNOTATION_STATUSES, default: 'draft' },
    objects: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          classKey: { type: String, required: true },
          bbox: { type: [Number], required: true },
          source: { type: String, enum: OBJECT_SOURCES, default: 'human' },
          score: { type: Number }
        }
      ],
      default: []
    },
    mask: {
      type: {
        _id: false,
        fileId: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        pixels: { type: Schema.Types.Mixed, default: {} }
      },
      default: undefined
    },
    elapsedMs: { type: Number, min: 0 },
    doneAt: { type: Date }
  },
  { timestamps: true, minimize: false }
);

// One annotation per user per task.
LabelAnnotationSchema.index({ taskId: 1, userId: 1 }, { unique: true });
LabelAnnotationSchema.index({ jobId: 1, userId: 1 });
LabelAnnotationSchema.index({ jobId: 1, status: 1 });

export const LabelAnnotation = model<ILabelAnnotation>('LabelAnnotation', LabelAnnotationSchema, 'label_annotations');
