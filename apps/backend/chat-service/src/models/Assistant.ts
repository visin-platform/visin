import { Schema, model } from 'mongoose';
import type { ReadOnlyModel } from './ReadOnlyModel';

/** Reusable private assistant. Ownership never grants additional research access. */
const assistantSchema = new Schema(
  {
    profileUserId: String,
    published: { type: Boolean, default: false },
    // Set by the deployment operator, never through the assistant editing API.
    platformDefault: { type: Boolean, default: false, select: false },
    managerIds: { type: [String], default: [] },
    createdBy: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    personality: { type: String, default: '', maxlength: 1500 },
    paused: { type: Boolean, default: false },
    /**
     * The people for whom this is the analyst a new private analysis starts with. Per person, so a shared assistant can be
     * one manager's default and not another's. Never read back in a list: it names other people.
     */
    defaultForUserIds: { type: [String], default: [], select: false },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
assistantSchema.set('autoIndex', false);
assistantSchema.set('autoCreate', false);
const model_ = model('ChatAssistantView', assistantSchema, 'chatassistants');
/** The assistants people can talk to. Reading only: what chat changes there it asks Vivi to (see assistantClient). */
export const Assistant: ReadOnlyModel<typeof model_> = model_;
