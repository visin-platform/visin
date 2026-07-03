import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { UserPayload } from '../types/auth';

function extractToken(req: Request): string | undefined {
  return req.headers.authorization?.replace('Bearer ', '');
}

/**
 * JWT authentication middleware — verifies the token and attaches the
 * decoded payload to `req.user`. Rejects with 401 if the token is missing
 * or fails signature verification.
 *
 * Header-only (no cookie support): only auth-service issues a browser
 * cookie today, and it layers its own tokenVersion invalidation check on
 * top of a JWT verify like this one — see
 * auth-service/src/middleware/authMiddleware.ts.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Access token required' });
    return;
  }

  try {
    req.user = jwt.verify(token, requireEnv('JWT_SECRET')) as UserPayload;
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * Like authenticateToken, but never blocks the request: attaches `req.user`
 * when a valid token is present, otherwise proceeds anonymously. For routes
 * that serve public + private data (e.g. public projects for anonymous
 * visitors, plus the caller's own private ones when logged in).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  if (req.user) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    req.user = jwt.verify(token, requireEnv('JWT_SECRET')) as UserPayload;
  } catch {
    // Invalid/expired token on an optional-auth route: proceed anonymously
    // rather than rejecting, same as a missing token.
  }
  next();
}
