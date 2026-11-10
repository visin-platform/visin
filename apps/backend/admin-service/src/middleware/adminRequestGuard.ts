import type { NextFunction, Request, Response } from 'express';
import { BadRequestError, ForbiddenError } from '@visin/backend-core';
import { isWrite } from '../services/upstreamService';

/** The configured browser origins, read per request so removing one takes effect without a restart. */
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Nothing administrative is cached. A write must be JSON (which a cross-site form cannot send without a CORS
 * preflight) and, when the browser names its origin, come from an allowed one.
 */
export function adminRequestGuard(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  if (!isWrite(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  if (origin && !allowedOrigins().includes(origin)) {
    next(new ForbiddenError('Untrusted administrator origin'));
    return;
  }
  if (!req.is('application/json')) {
    next(new BadRequestError('Use application/json for administrator actions'));
    return;
  }
  next();
}
