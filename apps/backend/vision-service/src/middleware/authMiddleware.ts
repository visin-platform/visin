import { Request } from 'express';
import { authenticateToken, optionalAuth } from '@visin/backend-core';

// req.user is now typed globally via @visin/backend-core's Express.Request
// augmentation; kept as a local alias so existing imports of `AuthRequest`
// across this service don't need to change.
export type AuthRequest = Request;

export const authMiddleware = authenticateToken;
export const optionalAuthMiddleware = optionalAuth;
