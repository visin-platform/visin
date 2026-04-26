import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenOperation } from '../utils/hmac';

/**
 * Middleware: internal API key authentication.
 * Services communicate with X-Internal-Api-Key header.
 */
export const requireApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.headers['x-internal-api-key'];
  if (!key || key !== process.env.FILE_SERVICE_API_KEY) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  next();
};

/**
 * Middleware factory: validate a signed URL token for browser-direct requests.
 * Expects ?token=...&expires=... query params alongside the :fileId route param.
 */
export const requireSignedToken = (operation: TokenOperation) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const { token, expires } = req.query as { token?: string; expires?: string };
    const fileId = [req.params.fileId].flat().join('/');

    if (!token || !expires) {
      res.status(401).json({ success: false, message: 'Missing token or expires' });
      return;
    }

    const expiresMs = parseInt(expires, 10);
    if (isNaN(expiresMs)) {
      res.status(400).json({ success: false, message: 'Invalid expires value' });
      return;
    }

    let valid = false;
    try {
      valid = verifyToken(operation, fileId, expiresMs, token);
    } catch {
      res.status(500).json({ success: false, message: 'Token verification failed' });
      return;
    }

    if (!valid) {
      res.status(403).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    next();
  };
