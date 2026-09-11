import { Request, Response, NextFunction } from 'express';
import { logger } from '@visin/backend-core';
import { verifyJWT } from '../services/jwtService';
import { User, IUser } from '../models/User';
// req.user is typed globally via @visin/backend-core's Express.Request
// augmentation, active program-wide once index.ts imports that package —
// no local declare global needed; a second, non-identical declaration here
// would conflict. dbUser is local to auth-service (per that augmentation's
// own comment), so it's declared here instead.
declare global {
  namespace Express {
    interface Request {
      dbUser?: IUser;
    }
  }
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

    req.user = decoded;

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
      if (typeof decoded.id === 'string' && decoded.id && decoded.tokenVersion != null) {
        const dbUser = await User.findOneAndUpdate(
          { _id: decoded.id, email: decoded.email.toLowerCase(), tokenVersion: decoded.tokenVersion },
          { $set: { lastLoginAt: new Date() } },
          { new: true, upsert: false }
        );
        if (dbUser) {
          req.user = decoded;
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
