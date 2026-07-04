import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { UserPayload } from '../types/auth';

/**
 * Cookie first: browser requests carry the shared `access_token` SSO cookie
 * (set by auth-service, readable here since COOKIE_DOMAIN is a shared parent
 * domain across every Visin subdomain — see createBaseApp's cookieParser).
 * Falls back to the Authorization header for non-browser callers, notably
 * vision-service's project-scoped API tokens (apiTokenMiddleware), which
 * were never cookie-based.
 */
function extractToken(req: Request): string | undefined {
  return req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
}

/**
 * JWT authentication middleware — verifies the token and attaches the
 * decoded payload to `req.user`. Rejects with 401 if the token is missing
 * or fails signature verification.
 *
 * Unlike auth-service's own authMiddleware, this doesn't layer a
 * tokenVersion invalidation check on top — see
 * auth-service/src/middleware/authMiddleware.ts for that.
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
