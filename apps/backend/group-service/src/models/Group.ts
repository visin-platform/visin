import { Schema, model, Document, Types } from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface IGroupMember {
  userId: string;
  email?: string;
  role: GroupRole;
  joinedAt: Date;
  lastActivity?: Date;
}

/**
 * An invitation: either a link (`tokenHash`, whoever holds the link may accept)
 * or addressed to one account (`userId`, found through "Add member" and
 * accepted by that account in the app). Never both.
 */
export interface IGroupInvitation {
  _id?: Types.ObjectId;
  tokenHash?: string;
  userId?: string;
  role: GroupRole;
  createdBy: string;
  expiresAt: Date;
}

export interface IGroup extends Document {
  _id: Types.ObjectId;
  __v?: number;
  name: string;
  /**
   * The address of the group's public page, `/g/:handle`. Chosen by its owner; unique.
   * Absent until they pick one, and required to turn the page on.
   */
  handle?: string;
  description?: string;
  /**
   * Whether the group has a public page, and shows its name on what it owns to people who
   * are not members. Off until the owner turns it on: a group's name and existence are
   * private by default.
   */
  profilePublic?: boolean;
  createdBy: string; // immutable account ID
  members: IGroupMember[];
  invitations?: IGroupInvitation[];
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    handle: { type: String, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 280 },
    profilePublic: { type: Boolean, default: false },
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
          tokenHash: { type: String },
          userId: { type: String },
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
GroupSchema.index({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } });
GroupSchema.index({ 'invitations.tokenHash': 1 });
GroupSchema.index({ 'invitations.userId': 1 });
// Invitation hashes are internal state, including on documents loaded for acceptance.
GroupSchema.set('toJSON', {
  transform: (_doc, value) => {
    delete value.invitations;
    return value;
  }
});

export const Group = model<IGroup>('Group', GroupSchema);
