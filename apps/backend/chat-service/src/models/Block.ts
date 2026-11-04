import { Schema, model } from 'mongoose';

const blockSchema = new Schema({
  userId: { type: String, required: true },
  blockedId: { type: String, required: true }
});
blockSchema.index({ userId: 1, blockedId: 1 }, { unique: true });
export const Block = model('ChatBlock', blockSchema);
