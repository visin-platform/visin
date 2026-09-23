import { Request, Response, NextFunction } from 'express';
import { logger } from '../logging/logger';
import { safeRequestPath } from '../logging/requestDiagnostics';
import { REQUEST_ID_HEADER, resolveRequestId, runWithRequestId } from '../logging/requestContext';

/**
 * Logs method, path, status code, and duration for every request, and gives
 * the request an id: the caller's `X-Request-Id` when it sent one, else a new
 * one. The id is on every log line written while handling the request, is
 * forwarded by `fetchWithTimeout`, and is echoed back, so one browser action
 * can be followed through every service it touched.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();
  res.on('finish', () => {
    logger.http(`${req.method} ${safeRequestPath(req.originalUrl)} ${res.statusCode} ${Date.now() - start}ms`, {
      requestId
    });
  });
  runWithRequestId(requestId, next);
}
