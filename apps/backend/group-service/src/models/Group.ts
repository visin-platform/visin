import { Schema, model, Document, Types } from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface IGroupMember {
  userId: string;
  email?: string;
  role: GroupRole;
  joinedAt: Date;
  lastActivity?: Date;
}

export interface IGroup extends Document {
  _id: Types.ObjectId;
  __v?: number;
  name: string;
  createdBy: string; // immutable account ID
  members: IGroupMember[];
  invitations?: { tokenHash: string; role: GroupRole; createdBy: string; expiresAt: Date }[];
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    createdBy: { type: String, required: true, index: true },
    members: [
      {
        userId: { type: String, required: true },
        email: { type: String, lowercase: true },
        role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
        joinedAt: { type: Date, default: Date.now },
        lastActivity: { type: Date, default: null }
      }
    ],
    invitations: {
      type: [
        {
          tokenHash: { type: String, required: true },
          role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
          createdBy: { type: String, required: true },
          expiresAt: { type: Date, required: true }
        }
      ],
      default: [],
      select: false
    },
    deletedAt: { type: Date, default: null }
  },
  { timestamps: true, optimisticConcurrency: true }
);

GroupSchema.index({ 'members.userId': 1 });
GroupSchema.index({ 'invitations.tokenHash': 1 });
// Invitation hashes are internal state, including on documents loaded for acceptance.
GroupSchema.set('toJSON', {
  transform: (_doc, value) => {
    delete value.invitations;
    return value;
  }
});

export const Group = model<IGroup>('Group', GroupSchema);
