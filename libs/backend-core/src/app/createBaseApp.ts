import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { securityHeaders } from '../middleware/security';
import { requestLogger } from '../middleware/requestLogger';
import { ForbiddenError } from '../errors/HttpError';

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
 * mounts identically: proxy trust (behind nginx), security headers, cookie
 * parsing, request logging, a general rate limiter, CORS with an origin
 * allowlist, and JSON body parsing. Routes, auth middleware, and the error
 * handler are still mounted by each service afterward.
 */
export function createBaseApp(options: CreateBaseAppOptions = {}): Express {
  const app = express();

  // Every service runs behind the nginx reverse proxy — trust its X-Forwarded-*
  // headers so express-rate-limit and req.ip key on the real client, not the proxy.
  app.set('trust proxy', 1);

  app.use(securityHeaders);
  // Populates req.cookies so authenticateToken can read the shared
  // access_token SSO cookie (COOKIE_DOMAIN is a shared parent domain across
  // every Visin subdomain) alongside the Authorization header.
  app.use(cookieParser());
  app.use(requestLogger);

  // Two buckets, because browser traffic and machine traffic have nothing in
  // common. A person clicking around makes a handful of requests a minute; one
  // bundle import PUTs tens of thousands of files from a single container IP.
  // Sharing the browser-sized bucket meant a large import 429'd itself partway
  // through — and, worse, could have starved every other service's internal
  // calls while it ran. `/internal/*` routes are credential-gated
  // (`requireApiKey` / `requireInternalServiceToken`) by every service that
  // mounts them, so this bucket exists to bound a runaway loop, not to
  // authenticate.
  const internalLimit = Number(process.env.INTERNAL_RATE_LIMIT_PER_MINUTE || 20_000);
  const publicLimit = Number(process.env.RATE_LIMIT_PER_MINUTE || 500);
  const isInternal = (path: string): boolean => path === '/internal' || path.startsWith('/internal/');

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: internalLimit,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => !isInternal(req.path)
    })
  );
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: publicLimit,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => isInternal(req.path)
    })
  );

  const allowedOrigins = options.corsOrigins ?? (process.env.CORS_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // A typed HttpError so the shared errorHandler returns a clean 403
        // instead of logging this as an "unhandled error" 500. Deliberately
        // NOT `callback(null, false)`: the cors package treats that as "skip
        // CORS headers but still call next()", which would let the request
        // reach routes/DB writes — only the browser's ability to *read* the
        // response would be blocked. Throwing stops the request outright.
        callback(new ForbiddenError('Not allowed by CORS: ' + origin));
      }
    },
    credentials: true,
    // Only pass these when actually configured: an explicit `methods: undefined`
    // overrides the cors package's defaults and crashes its preflight handler
    // (`methods.join` on undefined) — a 500 on every OPTIONS request.
    ...(options.corsMethods ? { methods: options.corsMethods } : {}),
    ...(options.corsAllowedHeaders ? { allowedHeaders: options.corsAllowedHeaders } : {}),
    ...(options.corsExposedHeaders ? { exposedHeaders: options.corsExposedHeaders } : {})
  }));

  if (options.json !== false) {
    app.use(express.json(options.json === undefined ? undefined : options.json));
  }

  return app;
}
