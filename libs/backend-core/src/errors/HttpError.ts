/**
 * Base class for errors that should be turned into a specific HTTP response
 * by the shared errorHandler, instead of every controller hand-rolling
 * try/catch + string-matching on error.message to pick a status code.
 *
 * Express 5 forwards rejected promises from async route handlers to the
 * mounted error handler automatically, so controllers can just
 * `throw new NotFoundError(...)` and stop wrapping in try/catch.
 */
export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    // Restore the prototype chain (needed when compiling to older targets
    // where `extends Error` doesn't preserve instanceof checks correctly).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request') {
    super(400, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Access denied') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}

export class TooManyRequestsError extends HttpError {
  constructor(message = 'Too many requests') {
    super(429, message);
  }
}
