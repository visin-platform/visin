import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ForbiddenError, logger, ServiceUnavailableError } from '@visin/backend-core';

/**
 * The platform-admin role, read from the account on the primary for every request, so revoking the role or
 * suspending the account takes effect on the next call. Runs after `authenticateToken`. A database error fails closed
 * as a 503, never a 401 or 403, which the front would show as signed out or not permitted.
 */
export async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const id = req.user?.id;
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    next(new ForbiddenError('Platform administrator access required'));
    return;
  }
  try {
    const account = await mongoose.connection
      .collection('users')
      .findOne(
        { _id: new mongoose.Types.ObjectId(id), roles: 'admin', status: { $nin: ['suspended', 'deleted'] } },
        { projection: { _id: 1 }, readPreference: 'primary', maxTimeMS: 3000 }
      );
    next(account ? undefined : new ForbiddenError('Platform administrator access required'));
  } catch (error) {
    logger.error('Administrator check failed', { error: (error as Error).message });
    next(new ServiceUnavailableError('Administrator access cannot be checked right now'));
  }
}
