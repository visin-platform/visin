import { Request, Response, NextFunction } from 'express';
import { authenticateToken as verifyJwt, validateInternalServiceToken } from '@visin/backend-core';

/**
 * Internal-service requests carry an X-Internal-Token instead of a user JWT.
 * The token is validated here, where user auth is skipped, rather than left to
 * each router: otherwise any router mounted under `/api` without its own
 * `validateInternalServiceToken` would admit a request carrying any value in
 * that header. Otherwise, require a valid, signed-in user.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-internal-token']) {
    validateInternalServiceToken(req, res, next);
    return;
  }
  verifyJwt(req, res, next);
}
