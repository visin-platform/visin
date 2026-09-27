import { Request } from 'express';
import { UnauthorizedError, UserPayload } from '@visin/backend-core';

/**
 * The signed-in caller, or a 401. Who may do what with a job is decided by its
 * dataset (`jobAccessService`), not by a group of the job's own.
 */
export const requireUser = (req: Request): UserPayload => {
  if (!req.user?.id) {
    throw new UnauthorizedError('Authenticated user required');
  }
  return req.user;
};
