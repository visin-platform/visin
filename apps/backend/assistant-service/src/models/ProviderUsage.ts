import { Schema, model } from 'mongoose';
const usage = new Schema(
  {
    runId: { type: String, required: true },
    userId: { type: String, required: true },
    kind: { type: String, enum: ['user', 'guest'], default: 'user' },
    feature: { type: String, default: 'vivi' },
    provider: String,
    model: String,
    state: { type: String, enum: ['pending', 'completed', 'uncertain'], default: 'pending' },
    inputTokens: Number,
    outputTokens: Number,
    cacheReadTokens: Number,
    cacheWriteTokens: Number,
    price: Schema.Types.Mixed,
    estimatedCost: Number,
    finishedAt: Date
  },
  { timestamps: true }
);
usage.index({ createdAt: -1, userId: 1 });
usage.index({ runId: 1, createdAt: 1 });
export const ProviderUsage = model('ChatProviderUsage', usage);
