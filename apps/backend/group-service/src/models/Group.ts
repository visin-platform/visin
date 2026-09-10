import { Schema, model, Document, Types } from 'mongoose';

export type GroupRole = 'owner' | 'admin' | 'member';

export interface IGroupMember {
  email: string;
  role: GroupRole;
  joinedAt: Date;
  lastActivity?: Date;
}

export interface IGroup extends Document {
  _id: Types.ObjectId;
  __v?: number;
  name: string;
  createdBy: string; // email
  members: IGroupMember[];
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GroupSchema = new Schema<IGroup>({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  createdBy: { type: String, required: true, lowercase: true, index: true },
  members: [{
    email: { type: String, required: true, lowercase: true, index: true },
    role: { type: String, enum: ['owner','admin','member'], required: true },
    joinedAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: null }
  }],
  deletedAt: { type: Date, default: null }
},{ timestamps: true, optimisticConcurrency: true });

GroupSchema.index({ 'members.email': 1 });

export const Group = model<IGroup>('Group', GroupSchema);
