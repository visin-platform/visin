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
