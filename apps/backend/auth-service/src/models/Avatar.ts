import mongoose, { Document, Schema } from 'mongoose';
import type { AvatarType } from '@visin/backend-core';

/**
 * An account's uploaded picture. Kept apart from `users` so the bytes are never read along with an account, which
 * is read on every request. One per account; setting a new one replaces it.
 */
export interface IAvatar extends Document {
  userId: mongoose.Types.ObjectId;
  contentType: AvatarType;
  data: Buffer;
  updatedAt: Date;
}

const AvatarSchema = new Schema<IAvatar>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    data: { type: Buffer, required: true }
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: 'user_avatars' }
);

export const Avatar = mongoose.model<IAvatar>('Avatar', AvatarSchema);
