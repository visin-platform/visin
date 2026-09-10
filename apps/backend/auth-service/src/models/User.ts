import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  firstName?: string;
  lastName?: string;
  signupMethod: string; // 'google' | 'password'
  /**
   * Only set for password accounts. `select: false` keeps it out of every
   * query that doesn't ask for it, so it can't leak through a controller that
   * returns a user document.
   */
  passwordHash?: string;
  roles: string[];
  /** Internal singleton marker; only first-run setup may assign it. */
  bootstrapSlot?: 'initial-admin';
  lastLoginAt?: Date;
  tokenVersion: number; // for token invalidation
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    signupMethod: { type: String, required: true },
    passwordHash: { type: String, select: false },
    roles: { type: [String], default: [] },
    bootstrapSlot: { type: String, enum: ['initial-admin'], immutable: true, select: false },
    lastLoginAt: { type: Date },
    tokenVersion: { type: Number, default: 1 }
  },
  { timestamps: true }
);

// The claim and administrator are one document, so a failed response cannot
// leave a pending lock or authorize another administrator. Other users omit it.
UserSchema.index({ bootstrapSlot: 1 }, {
  name: 'unique_initial_admin',
  unique: true,
  partialFilterExpression: { bootstrapSlot: 'initial-admin' },
});

export const User = model<IUser>('User', UserSchema);
