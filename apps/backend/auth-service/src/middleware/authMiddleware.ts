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
 * Deliberately not folded into @visin/backend-core's authenticateToken, even
 * though both now extract the token the same way (cookie, then Authorization
 * header): this one layers a tokenVersion check against the User collection
 * on every request, so a password/security-relevant change can invalidate
 * every outstanding JWT immediately instead of waiting for expiry. That
 * requires a DB round-trip and this service's User model — a cost/dependency
 * the other three services (group/file/vision) don't need for their own
 * routes, so the shared middleware stays a pure, stateless JWT verify and
 * this one stays local.
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }
    const decoded = verifyJWT(token);

    // Check if token version is valid
    const dbUser = await User.findOne({ email: decoded.email.toLowerCase() });
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
      req.user = decoded;
      // Upsert but do not block on approval
      await User.findOneAndUpdate(
        { email: decoded.email.toLowerCase() },
        {
          $setOnInsert: { email: decoded.email.toLowerCase(), signupMethod: 'google' },
          $set: { lastLoginAt: new Date() }
        },
        { new: true, upsert: true }
      );
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

// Enforce approval after basic authentication for protected areas; allow only specific endpoints before approval
export const requireApproved = (req: Request, res: Response, next: NextFunction): void => {
  const dbUser = req.dbUser;
  if (!dbUser) {
    res.status(401).json({ success: false, message: 'Not authenticated' });
    return;
  }
  if (!dbUser.isApproved) {
    res.status(403).json({ success: false, message: 'User not approved' });
    return;
  }
  next();
};
