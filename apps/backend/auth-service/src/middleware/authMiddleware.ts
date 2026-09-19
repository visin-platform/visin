import { Request, Response, NextFunction } from 'express';
import { logger, isLegacySessionlessToken } from '@visin/backend-core';
import { verifyJWT, UserPayload } from '../services/jwtService';
import { User, IUser } from '../models/User';
import { ISession, Session } from '../models/Session';
// req.user is typed globally via @visin/backend-core's Express.Request
// augmentation, active program-wide once index.ts imports that package —
// no local declare global needed; a second, non-identical declaration here
// would conflict. dbUser is local to auth-service (per that augmentation's
// own comment), so it's declared here instead.
declare global {
  namespace Express {
    interface Request {
      dbUser?: IUser;
      /** The caller's live session; absent only for a pre-sessions token. */
      authSession?: ISession;
    }
  }
}

/**
 * The session a token belongs to, if it is still live. `null` means the token
 * must be refused: its session was revoked or expired, or it carries none and
 * is not a pre-sessions token either. `undefined` is a legacy token, which has
 * no session to load but is otherwise acceptable.
 */
async function loadSession(decoded: UserPayload): Promise<ISession | null | undefined> {
  if (decoded.sid === undefined) {
    return isLegacySessionlessToken(decoded) ? undefined : null;
  }
  if (typeof decoded.sid !== 'string' || !/^[a-f\d]{24}$/i.test(decoded.sid)) return null;
  return Session.findOne(
    { _id: decoded.sid, userId: decoded.id, expiresAt: { $gt: new Date() } },
    undefined,
    { readPreference: 'primary', maxTimeMS: 3000 }
  );
}

/**
 * Auth-service loads its full local User model for role checks. Other services
 * perform the same identity/version check through backend-core's projected read
 * of the shared users collection. Neither path caches sessions across requests.
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }
    const decoded = verifyJWT(token);
    if (typeof decoded.id !== 'string' || !decoded.id) {
      res.status(401).json({ success: false, message: 'Invalid account identity' });
      return;
    }

    // Check if token version is valid
    const dbUser = await User.findOne(
      { _id: decoded.id, email: decoded.email.toLowerCase() },
      undefined,
      { readPreference: 'primary', maxTimeMS: 3000 }
    );
    if (!dbUser) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    // If token version is missing or doesn't match, token is invalid
    if (decoded.tokenVersion == null || decoded.tokenVersion !== dbUser.tokenVersion) {
      res.status(401).json({ success: false, message: 'Token has been invalidated' });
      return;
    }

    const session = await loadSession(decoded);
    if (session === null) {
      res.status(401).json({ success: false, message: 'Session has ended' });
      return;
    }

    req.user = decoded;
    req.authSession = session;

    // attach db user (if needed elsewhere)
    req.dbUser = dbUser;
    next();
  } catch (error) {
    logger.error('Token verification failed', { error: (error as Error)?.message });
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = verifyJWT(token);
      // A retained session must not recreate a deleted user or consume setup.
      // Matching identity and version in the update also rejects revoked tokens.
      const session = typeof decoded.id === 'string' && decoded.id ? await loadSession(decoded) : null;
      if (session !== null && decoded.tokenVersion != null) {
        const dbUser = await User.findOneAndUpdate(
          { _id: decoded.id, email: decoded.email.toLowerCase(), tokenVersion: decoded.tokenVersion },
          { $set: { lastLoginAt: new Date() } },
          { new: true, upsert: false }
        );
        if (dbUser) {
          req.user = decoded;
          req.authSession = session;
          req.dbUser = dbUser;
        }
      }
    }
    next();
  } catch {
    next();
  }
};

export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const dbUser = req.dbUser;
    if (!dbUser || !dbUser.roles || !dbUser.roles.includes(role)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    next();
  };
};
