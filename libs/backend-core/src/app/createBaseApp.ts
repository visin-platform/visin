import express, { Express } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { securityHeaders } from '../middleware/security';
import { requestLogger } from '../middleware/requestLogger';

export interface CreateBaseAppOptions {
  /** Allowed CORS origins. Defaults to process.env.CORS_ORIGIN (comma-separated). */
  corsOrigins?: string[];
  corsMethods?: string[];
  corsAllowedHeaders?: string[];
  corsExposedHeaders?: string[];
  /** Pass false to skip the global express.json() call, e.g. for services that parse JSON per-route or stream raw bodies. */
  json?: false | Parameters<typeof express.json>[0];
}

/**
 * Builds an Express app with the baseline middleware every Visin service
 * mounts identically: proxy trust (behind nginx), security headers, request
 * logging, a general rate limiter, CORS with an origin allowlist, and JSON
 * body parsing. Routes, auth middleware, and the error handler are still
 * mounted by each service afterward.
 */
export function createBaseApp(options: CreateBaseAppOptions = {}): Express {
  const app = express();

  // Every service runs behind the nginx reverse proxy — trust its X-Forwarded-*
  // headers so express-rate-limit and req.ip key on the real client, not the proxy.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  app.use(requestLogger);

  app.use(rateLimit({ windowMs: 60_000, limit: 500, standardHeaders: true, legacyHeaders: false }));

  const allowedOrigins = options.corsOrigins ?? (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS: ' + origin));
      }
    },
    credentials: true,
    methods: options.corsMethods,
    allowedHeaders: options.corsAllowedHeaders,
    exposedHeaders: options.corsExposedHeaders
  }));

  if (options.json !== false) {
    app.use(express.json(options.json === undefined ? undefined : options.json));
  }

  return app;
}
