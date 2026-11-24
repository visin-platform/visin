import { Schema, model } from 'mongoose';

/**
 * One request from the analyst to move the page beside the asker's chat panel. A run is queued and
 * claimed by whichever worker is free, and the browser's answer can land on another replica, so
 * the call lives in the database, never in a process's memory.
 */
const screenCallSchema = new Schema(
  {
    runId: { type: String, required: true },
    conversationId: { type: String, required: true },
    userId: { type: String, required: true },
    tabId: { type: String, required: true },
    place: { type: String, required: true },
    params: { type: Schema.Types.Mixed, default: {} },
    state: { type: String, enum: ['pending', 'done', 'failed', 'expired'], default: 'pending' },
    summary: String
  },
  { timestamps: true }
);
// The open stream of one tab looks for its pending calls.
screenCallSchema.index({ userId: 1, tabId: 1, state: 1 });
screenCallSchema.index({ state: 1, createdAt: 1 });
// Old calls are history nobody reads.
screenCallSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
export const ScreenCall = model('ChatScreenCall', screenCallSchema);
