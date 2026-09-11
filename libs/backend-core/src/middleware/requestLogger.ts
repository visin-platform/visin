import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger';
import { safeRequestPath } from '../logging/requestDiagnostics';

/** Logs method, path, status code, and duration for every request. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.http(`${req.method} ${safeRequestPath(req.originalUrl)} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
