import { Schema, model, Document, Types } from 'mongoose';

export const TASK_TYPES = ['single_choice', 'mask_toggle'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const JOB_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface IJobChoice {
  key: string;
  label: string;
  hotkey?: string;
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
  groupId: string;
  bundleId?: Types.ObjectId; // optional while draft; required to activate
  taskType: TaskType;
  question: {
    prompt: string;
    choices?: IJobChoice[]; // single_choice only; mask_toggle needs just the prompt
  };
  annotationSets: string[];
  redundancy: number;
  status: JobStatus;
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
    groupId: { type: String, required: true, index: true },
    bundleId: { type: Schema.Types.ObjectId, ref: 'LabelBundle' },
    taskType: { type: String, enum: TASK_TYPES, required: true },
    question: {
      prompt: { type: String, required: true, trim: true, maxlength: 500 },
      choices: [
        {
          key: { type: String, required: true, trim: true },
          label: { type: String, required: true, trim: true },
          hotkey: { type: String, trim: true, maxlength: 1 }
        }
      ]
    },
    annotationSets: [{ type: String, trim: true }],
    redundancy: { type: Number, default: 1, min: 1, max: 10 },
    status: { type: String, enum: JOB_STATUSES, default: 'draft', index: true }
  },
  { timestamps: true }
);

LabelJobSchema.index({ groupId: 1, status: 1 });

export const LabelJob = model<ILabelJob>('LabelJob', LabelJobSchema);
