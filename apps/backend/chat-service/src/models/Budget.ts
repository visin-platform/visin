import { Schema, model } from 'mongoose';

const budgetSchema = new Schema({
  userId: { type: String, required: true },
  day: { type: String, required: true },
  requests: { type: Number, default: 0 },
  reserved: { type: Number, default: 0 }
});
budgetSchema.index({ userId: 1, day: 1 }, { unique: true });
export const Budget = model('ChatBudget', budgetSchema);
