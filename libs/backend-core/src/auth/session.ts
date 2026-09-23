import mongoose from 'mongoose';
import type { UserPayload } from '../types/auth';
import { ServiceUnavailableError } from '../errors/HttpError';

/**
 * One document per signed-in browser, owned and written by auth-service; every
 * other service only reads it here. A session token names its document in the
 * `sid` claim, and the token is only as good as that document: deleting it
 * (sign-out, "sign out other devices") ends the session on the next request,
 * and its `expiresAt` — slid forward by auth-service while the user is active,
 * never past `absoluteExpiresAt` — is what idle expiry actually means.
 */
export const USER_SESSIONS_COLLECTION = 'user_sessions';

/**
 * The `typ` claim of a session token. Session and MCP access tokens share a
 * signing key, so this is what tells them apart explicitly rather than by
 * which claims happen to be present.
 */
export const SESSION_TOKEN_TYPE = 'session';

/** Whether `claims` are typed as a session token (and not, say, an MCP access token). */
export function hasSessionTokenType(claims: { typ?: unknown }): boolean {
  return claims.typ === SESSION_TOKEN_TYPE;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Whether a verified session token still stands: the account it names exists
 * at that email and token version, and its session (the `sid` claim) has
 * neither been revoked nor expired. Read on the primary, uncached, so a
 * revocation holds from the next request. Throws, rather than answering, when
 * the database cannot be asked.
 */
export async function isCurrentSession(claims: unknown): Promise<boolean> {
  if (!claims || typeof claims !== 'object') return false;
  const user = claims as Partial<UserPayload>;
  if (!hasSessionTokenType(user)) return false;
  if (typeof user.id !== 'string' || !OBJECT_ID.test(user.id) ||
      typeof user.email !== 'string' || !user.email ||
      !Number.isSafeInteger(user.tokenVersion) || (user.tokenVersion as number) < 1) return false;
  if (typeof user.sid !== 'string' || !OBJECT_ID.test(user.sid)) return false;
  // Do not buffer an authentication query while the database is unavailable.
  // Throw rather than answer false: an outage is not a revoked session.
  if (mongoose.connection.readyState !== 1) throw new ServiceUnavailableError('Session store unavailable');

  const options = { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 } as const;
  const userId = new mongoose.Types.ObjectId(user.id);
  const [account, session] = await Promise.all([
    mongoose.connection.collection('users').findOne(
      { _id: userId, email: user.email.toLowerCase(), tokenVersion: user.tokenVersion },
      options
    ),
    mongoose.connection.collection(USER_SESSIONS_COLLECTION).findOne(
      { _id: new mongoose.Types.ObjectId(user.sid), userId, expiresAt: { $gt: new Date() } },
      options
    )
  ]);
  return account !== null && session !== null;
}
