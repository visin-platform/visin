import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger';
import { sharedSecretMatches } from '../auth/sharedSecret';
import { HttpError, UnauthorizedError } from '../errors/HttpError';

export interface InternalServiceRequest extends Request {
  isInternalService?: boolean;
  serviceIdentifier?: string;
}

/**
 * Hard gate for routes that are exclusively called by other internal
 * services (never by an end-user browser/frontend) — always requires a
 * valid X-Internal-Token header.
 */
export function requireInternalServiceToken(req: Request, _res: Response, next: NextFunction): void {
  const token = req.headers['x-internal-token'] as string | undefined;
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (!expected) {
    logger.error('INTERNAL_SERVICE_TOKEN not configured');
    next(new HttpError(500, 'Internal service authentication not configured'));
    return;
  }
  if (!token) {
    next(new UnauthorizedError('Internal service token required'));
    return;
  }
  if (!sharedSecretMatches(token, expected)) {
    logger.warn('Invalid internal service token', { serviceId: req.headers['x-service-id'] });
    next(new UnauthorizedError('Invalid internal service token'));
    return;
  }
  next();
}

/**
 * Attaches `isInternalService`/`serviceIdentifier` when a valid
 * X-Internal-Token header is present, but never blocks the request — for
 * routes reachable by both end users and other services. Pair with
 * `allowUserOrInternalService` (after the user authMiddleware) to gate.
 */
export function validateInternalServiceToken(
  req: InternalServiceRequest,
  _res: Response,
  next: NextFunction
): void {
  const token = req.headers['x-internal-token'] as string | undefined;
  if (!token) {
    next();
    return;
  }

  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expected) {
    logger.error('INTERNAL_SERVICE_TOKEN not configured');
    next(new HttpError(500, 'Internal service authentication not configured'));
    return;
  }
  if (!sharedSecretMatches(token, expected)) {
    logger.warn('Invalid internal service token', { serviceId: req.headers['x-service-id'] });
    next(new UnauthorizedError('Invalid internal service token'));
    return;
  }

  req.isInternalService = true;
  req.serviceIdentifier = (req.headers['x-service-id'] as string) || 'unknown';
  next();
}

/** Gate: allow the request through if it's from an authenticated internal service OR a logged-in user. */
export function allowUserOrInternalService(
  req: InternalServiceRequest,
  _res: Response,
  next: NextFunction
): void {
  if (req.isInternalService) {
    return next();
  }
  if (!req.user) {
    next(new UnauthorizedError('Authentication required'));
    return;
  }
  next();
}
