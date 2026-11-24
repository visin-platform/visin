import { Schema, model } from 'mongoose';
import type { ReadOnlyModel } from './ReadOnlyModel';

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
    // The answer so far while it streams, kept until the answer is published. A preview only: `result` is the answer.
    draft: String,
    evidence: { type: [{ tool: String, input: Schema.Types.Mixed, at: Date }], default: [] },
    /** The notes the analyst wrote before each round of reading: its thinking, published with the answer. */
    thoughts: { type: [{ text: String, at: Date }], default: undefined },
    // What the analyst did, in order, as it did it: each read (the tool, when it started and ended) and each note it
    // wrote before reading (`thought`). Shown while it works. `detail` is what a search was for, in the model's words.
    steps: {
      type: [new Schema({ tool: String, detail: String, thought: String, startedAt: Date, endedAt: Date }, { _id: false })],
      default: []
    },
    published: { type: Boolean, default: false },
    activity: { type: String, default: 'Waiting' },
    error: String,
    // Why it failed, as a code the page can act on (see failureCode.ts). `error` stays the text.
    failureCode: String,
    // What this run holds against the asker's day while it runs, so a refusal can tell tokens spent from tokens held
    // by questions still under way. Read only while the run is `running`.
    reservation: { type: new Schema({ day: String, tokens: Number }, { _id: false }) },
    providerReplayVersion: { type: String, select: false },
    // Machine-only diagnostics; never save the provider body, prompt, headers or credentials.
    providerFailure: {
      type: new Schema({ status: Number, type: String, requestId: String, reason: String }, { _id: false }),
      select: false
    },
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
// Every open event stream reads a conversation's runs every two seconds.
// The publishing outbox, polled every second: completed runs only grow, unpublished ones stay few.
// The usage report reads answered questions by when they finished.
runSchema.set('autoIndex', false);
runSchema.set('autoCreate', false);
const model_ = model('ChatAssistantRunView', runSchema, 'chatassistantruns');
/** The questions put to assistants, and where each one is. Reading only: what chat changes there it asks Vivi to (see assistantClient). */
export const AssistantRun: ReadOnlyModel<typeof model_> = model_;
