import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger';

export interface InternalServiceRequest extends Request {
  isInternalService?: boolean;
  serviceIdentifier?: string;
}

function timingSafeTokenMatch(provided: string, expected: string): boolean {
  return provided.length === expected.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Hard gate for routes that are exclusively called by other internal
 * services (never by an end-user browser/frontend) — always requires a
 * valid X-Internal-Token header.
 */
export function requireInternalServiceToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-internal-token'] as string | undefined;
  const expected = process.env.INTERNAL_SERVICE_TOKEN;

  if (!expected) {
    logger.error('INTERNAL_SERVICE_TOKEN not configured');
    res.status(500).json({ success: false, message: 'Internal service authentication not configured' });
    return;
  }
  if (!token) {
    res.status(401).json({ success: false, message: 'Internal service token required' });
    return;
  }
  if (!timingSafeTokenMatch(token, expected)) {
    logger.warn('Invalid internal service token', { serviceId: req.headers['x-service-id'] });
    res.status(401).json({ success: false, message: 'Invalid internal service token' });
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
  res: Response,
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
    res.status(500).json({ success: false, message: 'Internal service authentication not configured' });
    return;
  }
  if (!timingSafeTokenMatch(token, expected)) {
    logger.warn('Invalid internal service token', { serviceId: req.headers['x-service-id'] });
    res.status(401).json({ success: false, message: 'Invalid internal service token' });
    return;
  }

  req.isInternalService = true;
  req.serviceIdentifier = (req.headers['x-service-id'] as string) || 'unknown';
  next();
}

/** Gate: allow the request through if it's from an authenticated internal service OR a logged-in user. */
export function allowUserOrInternalService(
  req: InternalServiceRequest,
  res: Response,
  next: NextFunction
): void {
  if (req.isInternalService) {
    return next();
  }
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  next();
}
