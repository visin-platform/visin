import { Schema, model } from 'mongoose';
export const GuestRun = model(
  'ChatGuestRun',
  new Schema(
    {
      _id: String,
      sessionId: { type: String, required: true },
      state: { type: String, enum: ['admitting', 'running', 'completed', 'failed'], default: 'admitting' },
      /** Kept with the answer, and as briefly, so a follow-up ("tell me more about the first") has what it follows. */
      question: String,
      answer: String,
      /** The answer so far, while it is being written: a preview only, gone once the answer is. */
      draft: String,
      error: String,
      /** Before an answer could draw on several projects; read only for runs saved then. */
      projectId: String,
      /** The public projects the answer drew from, each rechecked before the answer is shown. */
      projectIds: { type: [String], default: undefined },
      /** The public papers a lookup showed the answer, each rechecked before the answer is shown. */
      paperIds: { type: [String], default: undefined },
      /** The month's budget the run was admitted against, to give its slot back. */
      month: String,
      /** When the run was admitted and left for a worker; a run with none is still being admitted, or was refused. */
      queuedAt: Date,
      /** While a worker holds the run; past it the worker is taken to be gone. */
      leaseUntil: Date,
      /** How the worker answers: what the reservation was made for, not the settings of the moment it runs. */
      plan: {
        type: new Schema(
          { provider: String, model: String, rounds: Number, words: Number, resultBytes: Number },
          { _id: false }
        ),
        default: undefined
      },
      /** The page the visitor asked from. */
      page: {
        type: new Schema({ projectId: String, trainingId: String }, { _id: false }),
        default: undefined
      },
      finishedAt: Date,
      expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
  )
);
GuestRun.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// The worker looks for these every second: the oldest question waiting for it, and runs whose worker has gone.
GuestRun.schema.index({ queuedAt: 1 }, { partialFilterExpression: { state: 'admitting' } });
GuestRun.schema.index({ leaseUntil: 1 }, { partialFilterExpression: { state: 'running' } });
