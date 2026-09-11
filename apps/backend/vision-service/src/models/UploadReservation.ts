import mongoose, { Schema } from 'mongoose';

// Retain consumed reservations: deleting a resource must not make its upload
// reusable by another record. Expiry limits first attachment, not retention.
const schema = new Schema({
  fileId: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true },
  kind: { type: String, enum: ['archive', 'image', 'visualization'], required: true },
  parentId: { type: String, required: true },
  allocationId: { type: String, required: true },
  mimetype: { type: String, required: true },
  maxBytes: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
  resourceId: String,
  resourceKind: String,
  retired: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('UploadReservation', schema);
