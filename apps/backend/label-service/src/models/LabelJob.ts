import { Schema, model, Document, Types } from 'mongoose';

/** The one kind of job: an annotator draws boxes and masks on a frame. */
export const TASK_TYPES = ['annotate'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const JOB_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ANNOTATION_TOOLS = ['box', 'mask'] as const;
export type AnnotationTool = (typeof ANNOTATION_TOOLS)[number];

/** `camera` is the primary sensor: labels live in its pixel space, the others are overlays. */
export const SENSOR_KEYS = ['camera', 'lidar', 'radar'] as const;
export type SensorKey = (typeof SENSOR_KEYS)[number];

export const SENSOR_KINDS = ['image', 'points'] as const;
export type SensorKind = (typeof SENSOR_KINDS)[number];

/** Mask pixel value `0` is "unlabeled"; classes get 1..MAX_CLASSES and are never renumbered. */
export const MAX_CLASSES = 100;

export interface IJobClass {
  key: string;
  name: string;
  /** `#rrggbb`, chosen at creation; the front draws it through the theme's adapter */
  color: string;
  hotkey?: string;
  tools: AnnotationTool[];
  /** the value a pixel of this class has in a mask: fixed when the class is created, never reused */
  maskIndex: number;
  /** the name a detector knows this class by, when it differs from `name` */
  modelClass?: string;
}

export interface IJobSensor {
  key: SensorKey;
  /** the dataset image group the sensor's files live in */
  group: string;
  kind: SensorKind;
  /** file-name variant inside the group (`0001.lidar.png`), absent for plain `0001.png` */
  variant?: string;
}

export const SELECTION_KINDS = ['filter', 'manifest'] as const;
export type SelectionKind = (typeof SELECTION_KINDS)[number];

export interface IJobSelection {
  kind: SelectionKind;
  spec?: Record<string, unknown>; // provenance of the task set (sampleN/seed, manifest source)
}

export interface ILabelJob extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  createdBy: {
    userId: string;
    email: string;
    name?: string;
  };
  /**
   * the dataset-service dataset whose images the tasks show. Who may do what
   * with the job follows it: its owner and group roles, its visibility. Only
   * drafts from before that rule may lack one; their creator alone reaches them.
   */
  datasetId?: string;
  taskType: TaskType;
  classes: IJobClass[];
  sensors: IJobSensor[];
  redundancy: number;
  selection?: IJobSelection;
  status: JobStatus;
  isPublic: boolean;
  tasksCount: number; // denormalized at materialization
  createdAt: Date;
  updatedAt: Date;
}

const LabelJobSchema = new Schema<ILabelJob>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    createdBy: {
      userId: { type: String, required: true, index: true },
      email: { type: String, required: true, lowercase: true },
      name: { type: String }
    },
    datasetId: { type: String, index: true },
    taskType: { type: String, enum: TASK_TYPES, default: 'annotate' },
    classes: {
      type: [
        {
          _id: false,
          key: { type: String, required: true },
          name: { type: String, required: true, trim: true, maxlength: 60 },
          color: { type: String, required: true },
          hotkey: { type: String, trim: true, maxlength: 1 },
          tools: { type: [{ type: String, enum: ANNOTATION_TOOLS }], default: ['box', 'mask'] },
          maskIndex: { type: Number, required: true, min: 1, max: MAX_CLASSES },
          modelClass: { type: String, trim: true }
        }
      ],
      default: []
    },
    sensors: {
      type: [
        {
          _id: false,
          key: { type: String, enum: SENSOR_KEYS, required: true },
          group: { type: String, required: true, trim: true },
          kind: { type: String, enum: SENSOR_KINDS, default: 'image' },
          variant: { type: String, trim: true }
        }
      ],
      default: []
    },
    redundancy: { type: Number, default: 1, min: 1, max: 10 },
    selection: {
      type: {
        _id: false,
        kind: { type: String, enum: SELECTION_KINDS, required: true },
        spec: { type: Schema.Types.Mixed }
      },
      default: undefined
    },
    status: { type: String, enum: JOB_STATUSES, default: 'draft', index: true },
    isPublic: { type: Boolean, default: false },
    tasksCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

LabelJobSchema.index({ datasetId: 1, status: 1 });

export const LabelJob = model<ILabelJob>('LabelJob', LabelJobSchema, 'label_jobs');
