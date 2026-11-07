import { Schema, model } from 'mongoose';

const runSchema = new Schema(
  {
    conversationId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    state: {
      type: String,
      enum: ['queued', 'screen_queued', 'running', 'completed', 'failed', 'cancelled'],
      default: 'queued'
    },
    assistantId: String,
    assistantName: String,
    personality: String,
    // The tab whose page this run may move: only the tab that asked, copied from the message when queued.
    screen: {
      type: new Schema(
        {
          tabId: String,
          allowActions: Boolean,
          path: String,
          actions: {
            type: [
              new Schema(
                { name: String, ids: [String], labels: { type: [String], default: undefined } },
                { _id: false }
              )
            ],
            default: undefined
          }
        },
        { _id: false }
      )
    },
    result: String,
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    published: { type: Boolean, default: false },
    activity: { type: String, default: 'Waiting' },
    error: String,
    leaseUntil: Date,
    keyId: String,
    provider: String,
    model: String,
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    cacheReadTokens: { type: Number, default: 0 },
    cacheWriteTokens: { type: Number, default: 0 },
    providerRequests: { type: Number, default: 0 },
    toolCalls: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    attempt: { type: Number, default: 0 },
    membershipVersion: Number,
    // What the provider charged per million tokens when this answer was given, so a price that changes later
    // never rewrites what this question cost. Absent where no price was set then (see backfillPrices).
    price: {
      type: new Schema(
        {
          currency: { type: String, required: true },
          inputPerMillion: { type: Number, required: true },
          cacheReadPerMillion: { type: Number, min: 0 },
          cacheWritePerMillion: { type: Number, min: 0 },
          outputPerMillion: { type: Number, required: true },
          source: { type: String, enum: ['manual', 'fetched'], default: 'manual' },
          // Set afterwards by an administrator at the price then current, not at the time of the answer.
          backfilled: { type: Boolean, default: false }
        },
        { _id: false }
      )
    },
    finishedAt: Date
  },
  { timestamps: true }
);
runSchema.index({ state: 1, createdAt: 1 });
// Every open event stream reads a conversation's runs every two seconds.
runSchema.index({ conversationId: 1, userId: 1, createdAt: -1 });
// The publishing outbox, polled every second: completed runs only grow, unpublished ones stay few.
runSchema.index({ createdAt: 1 }, { partialFilterExpression: { state: 'completed', published: false } });
// The usage report reads answered questions by when they finished.
runSchema.index({ finishedAt: -1 }, { partialFilterExpression: { state: 'completed' } });
export const AssistantRun = model('ChatAssistantRun', runSchema);
