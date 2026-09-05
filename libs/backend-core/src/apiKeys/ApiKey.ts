import mongoose, { Document, Schema } from 'mongoose';
import type { ApiKeyScope } from './types';

/**
 * One API key.
 *
 * Lives in backend-core rather than in one service because both halves need it:
 * auth-service issues and revokes keys, and every other service verifies them on
 * the way in. All services share one database, so the model is shared rather
 * than the lookup going over HTTP on every request.
 */
export interface IApiKey extends Document {
  userId: string;
  /**
   * The owner's identity as it stood when the key was issued.
   *
   * Snapshotted so verifying a key stays a single indexed read. Filling in a
   * `UserPayload` would otherwise cost a second query into the users collection
   * on every API-key request, to serve fields almost no handler reads. The price
   * is that a later rename shows the old name on requests made with this key,
   * which is a fair trade and easy to reason about.
   */
  userEmail: string;
  userName: string;
  /** what the user called it — "Claude Code", "nightly benchmark job" */
  name: string;
  /** the public half of the token; unique, and what a presented key is looked up by */
  keyId: string;
  /** SHA-256 of the secret half — what verification actually compares against */
  hash: string;
  /** the whole token, encrypted, so the owner can read it back later */
  sealedCiphertext: string;
  sealedIv: string;
  sealedTag: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  /** reveals are counted and timestamped — reading a key back is worth a record */
  revealCount: number;
  lastRevealedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    userId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true },
    userName: { type: String, required: true, default: '' },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    keyId: { type: String, required: true, unique: true, index: true },
    hash: { type: String, required: true },
    sealedCiphertext: { type: String, required: true },
    sealedIv: { type: String, required: true },
    sealedTag: { type: String, required: true },
    // Defaulted to nothing rather than to something convenient: a key that was
    // created without scopes should authenticate and then be refused every
    // route, not quietly inherit a permission nobody chose.
    scopes: { type: [String], default: [] },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
    revokedAt: { type: Date },
    revealCount: { type: Number, default: 0 },
    lastRevealedAt: { type: Date }
  },
  { timestamps: true, collection: 'api_keys' }
);

// Every listing is one user's keys, newest first.
ApiKeySchema.index({ userId: 1, createdAt: -1 });

/**
 * Guarded against re-registration: several services import this module, and a
 * test suite that resets modules would otherwise hit mongoose's
 * `OverwriteModelError` on the second import.
 */
export const ApiKey = mongoose.models.ApiKey
  ? (mongoose.models.ApiKey as mongoose.Model<IApiKey>)
  : mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
