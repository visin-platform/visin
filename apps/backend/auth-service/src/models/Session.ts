import { Schema, model, Document, Types } from 'mongoose';
import { USER_SESSIONS_COLLECTION } from '@visin/backend-core';

export const SIGN_IN_METHODS = ['password', 'google', 'unknown'] as const;
export type SignInMethod = (typeof SIGN_IN_METHODS)[number];

/**
 * One signed-in browser. The session token names it in its `sid` claim, and
 * every service's auth middleware requires it to exist and be unexpired, so
 * deleting a document is how a session is revoked. Nothing is kept once a
 * session ends: the TTL index removes expired ones and revocation deletes.
 */
export interface ISession extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /**
   * How the user proved who they were. `unknown` only on sessions made for the
   * pre-sessions tokens they replaced; none are created now.
   */
  method: SignInMethod;
  /** The browser's User-Agent, truncated — only ever shown back to its owner as a device label. */
  userAgent?: string;
  createdAt: Date;
  /** Last renewal, to roughly the few minutes renewal is throttled to. */
  lastSeenAt: Date;
  /** Idle expiry: slides forward on renewal, never past `absoluteExpiresAt`. */
  expiresAt: Date;
  /** Hard cap from sign-in; however active the session, it ends here. */
  absoluteExpiresAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    method: { type: String, enum: SIGN_IN_METHODS, required: true },
    userAgent: { type: String, maxlength: 512 },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: USER_SESSIONS_COLLECTION }
);

// Expired sessions delete themselves. Middleware compares `expiresAt` itself as
// well, since the TTL monitor only runs about once a minute.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>('Session', SessionSchema);
