import type { NextFunction, Request, Response } from 'express';
import { authenticateToken, optionalAuth } from '@visin/backend-core';

// req.user is now typed globally via @visin/backend-core's Express.Request
// augmentation; kept as a local alias so existing imports of `AuthRequest`
// across this service don't need to change.
export type AuthRequest = Request;

/** Required auth: backend-core's session or Bearer check. */
export const authMiddleware = (req: Request, res: Response, next: NextFunction): Promise<void> | void =>
  authenticateToken(req, res, next);

export const optionalAuthMiddleware = optionalAuth;
