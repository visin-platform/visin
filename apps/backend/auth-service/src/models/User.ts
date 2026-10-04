import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  firstName?: string;
  lastName?: string;
  signupMethod: string; // 'google' | 'password'
  /** Google authentication binds to its immutable subject, never an email match. */
  googleSubject?: string;
  /**
   * Only set for password accounts. `select: false` keeps it out of every
   * query that doesn't ask for it, so it can't leak through a controller that
   * returns a user document.
   */
  passwordHash?: string;
  roles: string[];
  /**
   * What people see of the account in place of an email: the address of its public page
   * (`/u/:handle`) and the name on what it owns. Lowercase, unique, chosen for the person at
   * sign-up and theirs to change. Absent only on accounts older than handles, which get one
   * the first time their profile is read.
   */
  handle?: string;
  bio?: string;
  /** https links shown on the public profile. */
  links?: string[];
  /** From the Google account that last signed in; passwords have none. */
  picture?: string;
  /**
   * False hides the public page, and the name and picture on what the account owns:
   * what is shown is then only that someone owns it. Defaults to shown.
   */
  profilePublic?: boolean;
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
    googleSubject: { type: String, select: false },
    passwordHash: { type: String, select: false },
    roles: { type: [String], default: [] },
    handle: { type: String, lowercase: true, trim: true },
    bio: { type: String, trim: true, maxlength: 280 },
    links: { type: [String], default: undefined },
    picture: { type: String },
    profilePublic: { type: Boolean, default: true },
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

UserSchema.index({ handle: 1 }, {
  unique: true,
  partialFilterExpression: { handle: { $type: 'string' } }
});

UserSchema.index({ googleSubject: 1 }, {
  unique: true,
  partialFilterExpression: { googleSubject: { $type: 'string' } }
});

export const User = model<IUser>('User', UserSchema);
