import { Schema, model } from 'mongoose';

/** Deployment-wide settings an administrator changes from the page, one document each. */
const settingsSchema = new Schema(
  {
    _id: { type: String, required: true },
    enabled: { type: Boolean, required: true },
    provider: { type: String, enum: ['anthropic', 'openai'], default: 'anthropic' },
    model: { type: String, default: '' },
    // Absent on settings saved before there was one: the default applies.
    dailyTokenLimit: Number,
    toolRounds: Number,
    revision: { type: Number, default: 0 },
    history: {
      type: [
        new Schema({ actorId: String, at: Date, before: Schema.Types.Mixed, after: Schema.Types.Mixed }, { _id: false })
      ],
      default: []
    },
    updatedBy: String
  },
  { timestamps: true }
);
export const Settings = model('ChatSettings', settingsSchema);
