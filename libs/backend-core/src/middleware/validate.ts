import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodType } from 'zod';
import { BadRequestError } from '../errors/HttpError';

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map(issue => `${issue.path.length ? issue.path.join('.') + ': ' : ''}${issue.message}`)
    .join('; ');
}

/**
 * Validates (and coerces/defaults) `req.body`/`req.query`/`req.params` against
 * zod schemas before the route handler runs, throwing a `BadRequestError` with
 * a field-level message on failure instead of every controller hand-checking
 * `if (!field) ...`.
 *
 * `req.query` is a getter-only accessor on Express 5's Request prototype
 * (`req.query = x` throws `Cannot set property query ... which has only a
 * getter` under strict mode, which is what compiled TS emits) — so the parsed
 * result is applied via `Object.defineProperty` instead of assignment. `body`
 * and `params` are plain writable own properties and don't need this.
 */
export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true, enumerable: true });
      }
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        Object.defineProperty(req, 'params', { value: parsed, writable: true, configurable: true, enumerable: true });
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new BadRequestError(formatZodError(error)));
        return;
      }
      next(error);
    }
  };
}
