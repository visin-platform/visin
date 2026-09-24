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
 * not server bugs, but thrown as plain Mongoose error classes — and the
 * driver's duplicate-key error.
 */
const BODY_ERRORS: Record<string, { name: string; message: string }> = {
  'entity.parse.failed': { name: 'BadRequestError', message: 'The request body is not valid JSON' },
  'entity.too.large': {
    name: 'PayloadTooLargeError',
    message: 'The request body is larger than this endpoint accepts'
  },
  default: { name: 'RequestBodyError', message: 'The request body could not be read' }
};

function classifyError(error: Error): KnownError | null {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, name: error.name, message: error.message };
  }
  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return { statusCode: 400, name: error.name, message: error.message };
  }
  // A unique index refusing a second copy (E11000, from a single or a bulk
  // insert) is a client sending something that already exists — typically a
  // pipeline retrying a POST whose response it never saw — not a server fault.
  // The driver's message names the index and the duplicate key's value, so a
  // fixed message goes out instead.
  if ((error as { code?: unknown }).code === 11000) {
    return { statusCode: 409, name: 'ConflictError', message: 'A resource with this identifier already exists' };
  }
  // Express's body parsing refuses a malformed or oversized body before any
  // route runs. Its errors carry the status and an `entity.*` type; without
  // this they read as a 500, and a script that sent bad JSON is told the
  // server broke.
  const body = error as { type?: unknown; status?: unknown };
  if (
    typeof body.type === 'string' &&
    body.type.startsWith('entity.') &&
    typeof body.status === 'number' &&
    body.status >= 400 &&
    body.status < 500
  ) {
    return { statusCode: body.status, ...(BODY_ERRORS[body.type] ?? BODY_ERRORS.default) };
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
    // A 401 is routine — every signed-out visitor's session check is one — so it
    // is not worth a warning; the request log line still records it.
    logger[known.statusCode === 401 ? 'debug' : 'warn']('Request failed', {
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
