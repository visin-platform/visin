import mongoose, { Document, Schema } from 'mongoose';
import type { AvatarType } from '@visin/backend-core';

/**
 * A group's uploaded picture. Kept apart from `groups` so the bytes are never read along with a group, which is
 * read for every membership check. One per group; setting a new one replaces it.
 */
export interface IGroupAvatar extends Document {
  groupId: mongoose.Types.ObjectId;
  contentType: AvatarType;
  data: Buffer;
  updatedAt: Date;
}

const GroupAvatarSchema = new Schema<IGroupAvatar>(
  {
    groupId: { type: Schema.Types.ObjectId, required: true, unique: true },
    contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
    data: { type: Buffer, required: true }
  },
  { timestamps: { createdAt: false, updatedAt: true }, collection: 'group_avatars' }
);

export const GroupAvatar = mongoose.model<IGroupAvatar>('GroupAvatar', GroupAvatarSchema);
