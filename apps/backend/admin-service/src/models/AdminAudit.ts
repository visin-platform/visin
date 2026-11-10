import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * How a forwarded administrator write ended.
 *
 * - `pending`: recorded before the owning service was called; a row left here means the gateway stopped mid-call.
 * - `completed` / `rejected`: the owning service answered with a success / an error status.
 * - `uncertain`: the call failed in transit, so the change may or may not have been applied.
 */
export const AUDIT_STATUSES = ['pending', 'completed', 'rejected', 'uncertain'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

/** Metadata only: never the request body, which can carry provider keys, passwords or reasons. */
const adminAuditSchema = new Schema(
  {
    actorId: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    status: { type: String, enum: AUDIT_STATUSES, default: 'pending' },
    responseStatus: Number
  },
  // Listed newest first by `_id`, which is time-ordered and indexed already.
  { timestamps: true }
);

export type AdminAuditEntry = InferSchemaType<typeof adminAuditSchema>;
export const AdminAudit = model('AdminAudit', adminAuditSchema);
