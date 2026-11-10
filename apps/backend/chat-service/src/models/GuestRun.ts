import { Schema, model } from 'mongoose';
export const GuestRun = model(
  'ChatGuestRun',
  new Schema(
    {
      _id: String,
      sessionId: { type: String, required: true },
      month: String,
      state: { type: String, enum: ['admitting', 'running', 'completed', 'failed'], default: 'admitting' },
      answer: String,
      error: String,
      /** Before an answer could draw on several projects; read only for runs saved then. */
      projectId: String,
      /** The public projects the answer drew from, each rechecked before the answer is shown. */
      projectIds: { type: [String], default: undefined },
      finishedAt: Date,
      expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
  )
);
GuestRun.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
