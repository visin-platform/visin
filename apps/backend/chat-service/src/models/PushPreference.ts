import { Schema, model } from 'mongoose';

/**
 * What a person wants pushed beyond chat itself. A row exists only once they have chosen: with none, the defaults
 * apply (run alerts on, since they only reach devices the person turned notifications on for).
 */
const pushPreferenceSchema = new Schema(
  { userId: { type: String, required: true, unique: true }, runs: { type: Boolean, default: true } },
  { timestamps: true }
);
export const PushPreference = model('ChatPushPreference', pushPreferenceSchema);
