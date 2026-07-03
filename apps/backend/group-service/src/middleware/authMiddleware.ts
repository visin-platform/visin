import { Request, Response, NextFunction } from 'express';
import { authenticateToken as verifyJwt } from '@visin/backend-core';

/**
 * Internal-service requests carry their own X-Internal-Token, validated
 * downstream by validateInternalServiceToken/allowUserOrInternalService
 * (see internalServiceAuth.ts) — skip user JWT auth for those and defer.
 * Otherwise, require a valid, signed-in user.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-token']) {
    next();
    return;
  }
  verifyJwt(req, res, next);
}
