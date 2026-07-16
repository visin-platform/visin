import { Schema, model, Document, Types } from 'mongoose';

export interface ILabelAnswer extends Document {
  _id: Types.ObjectId;
  taskId: Types.ObjectId;
  jobId: Types.ObjectId;
  userId: string;
  userEmail: string;
  userName?: string; // display name snapshotted from the JWT
  choiceKey?: string; // single_choice
  rejectedMaskIds?: number[]; // mask_toggle — unmarked masks are implicitly correct
  elapsedMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

const LabelAnswerSchema = new Schema<ILabelAnswer>(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'LabelTask', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'LabelJob', required: true },
    userId: { type: String, required: true },
    userEmail: { type: String, required: true, lowercase: true },
    userName: { type: String },
    choiceKey: { type: String },
    rejectedMaskIds: { type: [Number], default: undefined },
    elapsedMs: { type: Number, min: 0 }
  },
  { timestamps: true }
);

// One answer per user per task.
LabelAnswerSchema.index({ taskId: 1, userId: 1 }, { unique: true });
LabelAnswerSchema.index({ jobId: 1, userId: 1 });

export const LabelAnswer = model<ILabelAnswer>('LabelAnswer', LabelAnswerSchema);
