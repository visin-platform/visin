import mongoose from 'mongoose';
import { Session } from '../../models/Session';
import { generateJWT, UserPayload } from '../../services/jwtService';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Signs a session token the way sign-in does: a live `user_sessions` document
 * owned by `sessionUserId` (by default the token's own user), named by `sid`.
 * For integration suites that need a signed-in caller without going through
 * a sign-in route.
 */
export async function signSessionToken(payload: UserPayload, sessionUserId: string = payload.id): Promise<string> {
  const now = Date.now();
  const session = await Session.create({
    userId: mongoose.isValidObjectId(sessionUserId) ? sessionUserId : new mongoose.Types.ObjectId(),
    method: 'password',
    lastSeenAt: new Date(now),
    expiresAt: new Date(now + DAY_MS),
    absoluteExpiresAt: new Date(now + DAY_MS)
  });
  return generateJWT({ ...payload, sid: session._id.toString() }, new Date(now + DAY_MS));
}
