import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { UserPayload } from '../types/auth';
import { isAccessTokenClaims } from '../oauth/tokens';

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
    const claims = jwt.verify(token, requireEnv('JWT_SECRET'));

    // An OAuth access token is signed with the same secret and arrives in the
    // same header, but it is not a session: it names the user in `sub`, not
    // `id`, so casting one to UserPayload leaves `req.user.id` undefined and
    // every owner-scoped query silently unbounded. `apiKeyAuth` owns that
    // credential and applies its scopes; anywhere it is not mounted, refuse.
    if (isAccessTokenClaims(claims)) {
      res.status(401).json({
        success: false,
        message: 'This endpoint does not accept an MCP access token'
      });
      return;
    }

    req.user = claims as UserPayload;
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
    const claims = jwt.verify(token, requireEnv('JWT_SECRET'));
    // Same reasoning as authenticateToken: an access token is not a session.
    // Proceeding anonymously is this route's way of refusing.
    if (!isAccessTokenClaims(claims)) {
      req.user = claims as UserPayload;
    }
  } catch {
    // Invalid/expired token on an optional-auth route: proceed anonymously
    // rather than rejecting, same as a missing token.
  }
  next();
}
