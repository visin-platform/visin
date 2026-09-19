import mongoose from 'mongoose';
import type { UserPayload } from '../types/auth';

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
 * Tokens minted before sessions existed carry no `sid` and lived 24 hours.
 * Nothing mints a session-less token any more (auth-service upgrades one to a
 * session the next time `/auth/verify` sees it), so this window closes by
 * itself a day after the last such token was issued; the branch accepting them
 * can be deleted once every deployment has run a sessions release that long.
 */
const LEGACY_TOKEN_MAX_LIFETIME_SECONDS = 24 * 60 * 60;

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** True for a pre-sessions token: no `sid`, and the old 24-hour lifetime at most. */
export function isLegacySessionlessToken(claims: unknown): boolean {
  if (!claims || typeof claims !== 'object') return false;
  const { sid, iat, exp } = claims as { sid?: unknown; iat?: unknown; exp?: unknown };
  return sid === undefined &&
    Number.isSafeInteger(iat) && Number.isSafeInteger(exp) &&
    (exp as number) - (iat as number) <= LEGACY_TOKEN_MAX_LIFETIME_SECONDS;
}

/**
 * Whether a verified session token still stands: the account it names exists
 * at that email and token version, and — for a token with a `sid` — its session
 * has neither been revoked nor expired. Read on the primary, uncached, so a
 * revocation holds from the next request.
 */
export async function isCurrentSession(claims: unknown): Promise<boolean> {
  if (!claims || typeof claims !== 'object') return false;
  const user = claims as Partial<UserPayload>;
  if (typeof user.id !== 'string' || !OBJECT_ID.test(user.id) ||
      typeof user.email !== 'string' || !user.email ||
      !Number.isSafeInteger(user.tokenVersion) || (user.tokenVersion as number) < 1) return false;
  if (user.sid !== undefined && (typeof user.sid !== 'string' || !OBJECT_ID.test(user.sid))) return false;
  if (user.sid === undefined && !isLegacySessionlessToken(claims)) return false;
  // Do not buffer an authentication query while the database is unavailable.
  if (mongoose.connection.readyState !== 1) return false;

  const options = { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 } as const;
  const userId = new mongoose.Types.ObjectId(user.id);
  const [account, session] = await Promise.all([
    mongoose.connection.collection('users').findOne(
      { _id: userId, email: user.email.toLowerCase(), tokenVersion: user.tokenVersion },
      options
    ),
    user.sid === undefined
      ? Promise.resolve(true)
      : mongoose.connection.collection(USER_SESSIONS_COLLECTION).findOne(
        { _id: new mongoose.Types.ObjectId(user.sid), userId, expiresAt: { $gt: new Date() } },
        options
      )
  ]);
  return account !== null && session !== null;
}
