import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { logger, hasSessionTokenType, ForbiddenError, ServiceUnavailableError, UnauthorizedError } from '@visin/backend-core';
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
      /** The caller's live session, set by `authenticateToken`. */
      authSession?: ISession;
    }
  }
}

/**
 * The session a token belongs to, if it is still live; `null` when it was
 * revoked or expired, or the token names none.
 */
async function loadSession(decoded: UserPayload): Promise<ISession | null> {
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
export const authenticateToken = async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    next(new UnauthorizedError('Access token required'));
    return;
  }

  let decoded: UserPayload;
  try {
    decoded = verifyJWT(token);
  } catch (error) {
    logger.error('Token verification failed', { error: (error as Error)?.message });
    next(new UnauthorizedError('Invalid or expired token'));
    return;
  }
  if (!hasSessionTokenType(decoded) || typeof decoded.id !== 'string' || !decoded.id || typeof decoded.email !== 'string') {
    next(new UnauthorizedError('Invalid account identity'));
    return;
  }

  // An unreachable database is an outage, not a sign-out: answer 503 so the
  // fronts keep the session (a 401 from /auth/verify reads as "logged out").
  // Checked up front so the lookup is not buffered for mongoose's 10 seconds.
  if (mongoose.connection.readyState !== 1) {
    next(new ServiceUnavailableError('Authentication temporarily unavailable'));
    return;
  }

  let dbUser: IUser | null;
  let session: ISession | null;
  try {
    dbUser = await User.findOne(
      { _id: decoded.id, email: decoded.email.toLowerCase() },
      undefined,
      { readPreference: 'primary', maxTimeMS: 3000 }
    );
    session = dbUser ? await loadSession(decoded) : null;
  } catch (error) {
    logger.error('Session check failed', { error: (error as Error)?.message });
    next(new ServiceUnavailableError('Authentication temporarily unavailable'));
    return;
  }

  if (!dbUser) {
    next(new UnauthorizedError('User not found'));
    return;
  }

  // If token version is missing or doesn't match, token is invalid
  if (decoded.tokenVersion == null || decoded.tokenVersion !== dbUser.tokenVersion) {
    next(new UnauthorizedError('Token has been invalidated'));
    return;
  }

  if (session === null) {
    next(new UnauthorizedError('Session has ended'));
    return;
  }

  req.user = decoded;
  req.authSession = session;

  // attach db user (if needed elsewhere)
  req.dbUser = dbUser;
  next();
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = verifyJWT(token);
      // A retained session must not recreate a deleted user or consume setup.
      // Matching identity and version in the update also rejects revoked tokens.
      const session = hasSessionTokenType(decoded) && typeof decoded.id === 'string' && decoded.id
        ? await loadSession(decoded)
        : null;
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
  return (req: Request, _res: Response, next: NextFunction): void => {
    const dbUser = req.dbUser;
    if (!dbUser || !dbUser.roles || !dbUser.roles.includes(role)) {
      next(new ForbiddenError('Forbidden'));
      return;
    }
    next();
  };
};
