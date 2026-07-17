import { Request, Response, NextFunction } from 'express';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '@visin/backend-core';
import { verifyToken, TokenOperation } from '../utils/hmac';

/**
 * Middleware: internal API key authentication.
 * Services communicate with X-Internal-Api-Key header.
 */
export const requireApiKey = (req: Request, _res: Response, next: NextFunction): void => {
  const key = req.headers['x-internal-api-key'];
  if (!key || key !== process.env.FILE_SERVICE_API_KEY) {
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

    const expiresMs = parseInt(expires, 10);
    if (isNaN(expiresMs)) {
      throw new BadRequestError('Invalid expires value');
    }

    // A malformed token (wrong length/hex) makes crypto.timingSafeEqual throw;
    // treat that the same as a plain invalid token rather than a server error.
    let valid: boolean;
    try {
      valid = verifyToken(operation, fileId, expiresMs, token);
    } catch {
      valid = false;
    }

    if (!valid) {
      throw new ForbiddenError('Invalid or expired token');
    }

    next();
  };
