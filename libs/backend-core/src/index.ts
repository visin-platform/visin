// @visin/backend-core - Shared backend functionality for Visin services

// Types
export type { UserPayload } from './types/auth';

// Config
export { requireEnv } from './config/env';

// Errors
export {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError
} from './errors/HttpError';

// Logging
export { logger } from './logging/logger';

// Middleware
export { authenticateToken, optionalAuth } from './middleware/authMiddleware';
export {
  requireInternalServiceToken,
  validateInternalServiceToken,
  allowUserOrInternalService
} from './middleware/internalServiceAuth';
export type { InternalServiceRequest } from './middleware/internalServiceAuth';
export { errorHandler, asyncHandler } from './middleware/errorHandler';
export { securityHeaders, createRateLimiter, standardRateLimiter, strictRateLimiter } from './middleware/security';
export { requestLogger } from './middleware/requestLogger';
export { validateRequest } from './middleware/validate';
export type { RequestSchemas } from './middleware/validate';

// Re-exported so services can author zod schemas without their own direct
// dependency on zod — one version, declared once, in this package.
export { z } from 'zod';

// Database
export { connectDb } from './db/connectDb';
export type { ConnectDbOptions } from './db/connectDb';

// App factory
export { createBaseApp } from './app/createBaseApp';
export type { CreateBaseAppOptions } from './app/createBaseApp';

// Health check
export { createHealthCheckHandler } from './health/createHealthCheckHandler';
export type { CreateHealthCheckHandlerOptions } from './health/createHealthCheckHandler';
