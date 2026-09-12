import { timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '@visin/backend-core';
import { resolvePath } from '../utils/paths';
import { verifyToken, TokenOperation } from '../utils/hmac';

/** Constant-time, so response timing cannot recover the key a byte at a time. */
const matchesApiKey = (provided: string | string[] | undefined, expected: string | undefined): boolean => {
  if (typeof provided !== 'string' || !expected) return false;
  const given = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

/**
 * Middleware: internal API key authentication.
 * Services communicate with X-Internal-Api-Key header.
 */
export const requireApiKey = (req: Request, _res: Response, next: NextFunction): void => {
  if (!matchesApiKey(req.headers['x-internal-api-key'], process.env.FILE_SERVICE_API_KEY)) {
    throw new UnauthorizedError('Unauthorized');
  }
  next();
};

/**
 * Middleware factory: validate a signed URL token for browser-direct requests.
 * Expects ?token=...&expires=... query params alongside the :fileId route param.
 */
export const requireSignedToken = (operation: TokenOperation) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { token, expires } = req.query as { token?: string; expires?: string };
    const fileId = [req.params.fileId].flat().join('/');

    if (!token || !expires) {
      throw new UnauthorizedError('Missing token or expires');
    }

    resolvePath(fileId);
    const expiresMs = Number(expires);
    if (typeof expires !== 'string' || !/^\d+$/.test(expires) || !Number.isSafeInteger(expiresMs)) {
      throw new BadRequestError('Invalid expires value');
    }

    const reservation = operation === 'upload' ? req.query.reservation : '';
    if (typeof reservation !== 'string' || (operation === 'upload' && !/^[a-f0-9-]{36}$/.test(reservation))) throw new ForbiddenError('Missing upload reservation');

    // A malformed token (wrong length/hex) makes crypto.timingSafeEqual throw;
    // treat that the same as a plain invalid token rather than a server error.
    let valid: boolean;
    try {
      valid = verifyToken(operation, fileId, expiresMs, token, reservation);
    } catch {
      valid = false;
    }

    if (!valid) {
      throw new ForbiddenError('Invalid or expired token');
    }

    next();
  };
