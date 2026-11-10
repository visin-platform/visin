import { Schema, model } from 'mongoose';

/**
 * One browser's Web Push endpoint, keyed on `endpoint` (what the push service hands the browser). A person has as
 * many rows as installed copies: a phone, a tablet, a laptop. `failureCount` exists because endpoints die silently:
 * a reset phone leaves a row that never delivers again, and without pruning they pile up.
 */
const pushSubscriptionSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    },
    userAgent: { type: String, default: '' },
    platform: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    failureCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);
export const PushSubscription = model('ChatPushSubscription', pushSubscriptionSchema);
