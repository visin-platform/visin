import { Schema, model } from 'mongoose';

/** Reusable private assistant. Ownership never grants additional research access. */
const assistantSchema = new Schema(
  {
    profileUserId: String,
    published: { type: Boolean, default: false },
    managerIds: { type: [String], default: [] },
    createdBy: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    personality: { type: String, default: '', maxlength: 1500 },
    paused: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
export const Assistant = model('ChatAssistant', assistantSchema);
