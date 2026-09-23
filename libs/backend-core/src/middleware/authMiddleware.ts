import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env';
import { UserPayload } from '../types/auth';
import { isAccessTokenClaims } from '../oauth/tokens';
import { isCurrentSession } from '../auth/session';
import { logger } from '../logging/logger';
import { ServiceUnavailableError, UnauthorizedError } from '../errors/HttpError';

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
 * decoded payload to `req.user`. Passes a 401 to the error handler if the
 * token is missing or fails verification, and a 503 if the session store
 * cannot be reached. Errors go to `next` rather than being thrown, so a
 * wrapper that calls this without awaiting it cannot leak a rejection.
 *
 * Checks the account's current token version on the existing shared MongoDB
 * connection. No cross-request cache: a revoked session cannot regain authority.
 */
export async function authenticateToken(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.user) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    next(new UnauthorizedError('Access token required'));
    return;
  }

  let claims: string | jwt.JwtPayload;
  try {
    claims = jwt.verify(token, requireEnv('JWT_SECRET'), { algorithms: ['HS256'] });
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
    return;
  }

  // An OAuth access token is signed with the same secret and arrives in the
  // same header, but it is not a session: it names the user in `sub`, not
  // `id`, so casting one to UserPayload leaves `req.user.id` undefined and
  // every owner-scoped query silently unbounded. `apiKeyAuth` owns that
  // credential and applies its scopes; anywhere it is not mounted, refuse.
  if (isAccessTokenClaims(claims)) {
    next(new UnauthorizedError('This endpoint does not accept an MCP access token'));
    return;
  }

  // Still fails closed, but as a 503: a 401 here sends every browser to the
  // sign-in page for the length of a database blip.
  let current: boolean;
  try {
    current = await isCurrentSession(claims);
  } catch (error) {
    logger.error('Session check failed', { error: (error as Error)?.message });
    next(new ServiceUnavailableError('Authentication temporarily unavailable'));
    return;
  }
  if (!current) {
    next(new UnauthorizedError('Invalid or expired token'));
    return;
  }
  req.user = claims as UserPayload;
  next();
}

/**
 * Like authenticateToken, but never blocks the request: attaches `req.user`
 * when a valid token is present, otherwise proceeds anonymously. For routes
 * that serve public + private data (e.g. public projects for anonymous
 * visitors, plus the caller's own private ones when logged in).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (req.user) {
    return next();
  }

  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const claims = jwt.verify(token, requireEnv('JWT_SECRET'), { algorithms: ['HS256'] });
    // Same reasoning as authenticateToken: an access token is not a session.
    // Proceeding anonymously is this route's way of refusing.
    if (!isAccessTokenClaims(claims) && await isCurrentSession(claims)) {
      req.user = claims as UserPayload;
    }
  } catch {
    // Invalid/expired token on an optional-auth route: proceed anonymously
    // rather than rejecting, same as a missing token.
  }
  next();
}
