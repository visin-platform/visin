import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../logging/logger';
import { HttpError } from '../errors/HttpError';
import { safeRequestPath, redactRequestDiagnostic } from '../logging/requestDiagnostics';

interface KnownError {
  statusCode: number;
  name: string;
  message: string;
}

/**
 * Recognizes error shapes that map to an obvious HTTP status without a
 * controller having to catch and re-throw them: our own typed HttpError
 * hierarchy, plus Mongoose's ValidationError (failed schema validation)
 * and CastError (e.g. an invalid ObjectId string) — both client mistakes,
 * not server bugs, but thrown as plain Mongoose error classes.
 */
function classifyError(error: Error): KnownError | null {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, name: error.name, message: error.message };
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return { statusCode: 400, name: error.name, message: error.message };
  }
  return null;
}

/**
 * Global error handler middleware — mount last, after all routes (and after
 * `cors()`, so CORS headers are already set on error responses too).
 *
 * Controllers throw a typed HttpError (BadRequestError, NotFoundError, ...)
 * instead of hand-rolling try/catch + string-matching on error.message to
 * pick a status code; Express 5 forwards rejected promises from async route
 * handlers here automatically. Anything not a recognized error type is
 * treated as an unexpected bug: logged with its full stack, returned as a
 * generic 500 with no message leak outside development.
 */
export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const known = classifyError(error);

  if (known) {
    logger.warn('Request failed', {
      error: redactRequestDiagnostic(known.message, req.originalUrl),
      statusCode: known.statusCode,
      url: safeRequestPath(req.originalUrl),
      method: req.method
    });
    res.status(known.statusCode).json({ success: false, error: known.name, message: known.message });
    return;
  }

  logger.error('Unhandled error', {
    error: redactRequestDiagnostic(error.message, req.originalUrl),
    stack: redactRequestDiagnostic(error.stack, req.originalUrl),
    url: safeRequestPath(req.originalUrl),
    method: req.method
  });

  const isDevelopment = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: isDevelopment ? error.message : 'Something went wrong',
    ...(isDevelopment && { stack: error.stack })
  });
};

/**
 * Wraps an async Express handler so a rejected promise reaches errorHandler.
 * Express 5 (all four Visin services) already forwards async rejections
 * automatically, so this is mainly for explicitness in route definitions
 * and safety if a service ever needs to interop with Express 4 code.
 */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
