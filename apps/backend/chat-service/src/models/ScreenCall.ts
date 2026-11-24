import { Schema, model } from 'mongoose';
import type { ReadOnlyModel } from './ReadOnlyModel';

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
// Old calls are history nobody reads.
screenCallSchema.set('autoIndex', false);
screenCallSchema.set('autoCreate', false);
const model_ = model('ChatScreenCallView', screenCallSchema, 'chatscreencalls');
/** What an assistant asks a person's open page to do. Reading only: what chat changes there it asks Vivi to (see assistantClient). */
export const ScreenCall: ReadOnlyModel<typeof model_> = model_;
