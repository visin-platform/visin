import helmet from 'helmet';
import rateLimit, { Options as RateLimitOptions } from 'express-rate-limit';

/**
 * Standard security headers (helmet) for all services.
 *
 * - `contentSecurityPolicy` is off: these are JSON APIs, not HTML apps.
 * - `crossOriginResourcePolicy` is relaxed to `cross-origin`: helmet's
 *   default (`same-origin`) makes browsers refuse to read the response from
 *   a different origin — which every frontend is, since each front and
 *   backend service runs on its own port. `cors()` already does origin
 *   enforcement; this header must not fight it.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
});

/** Build a rate limiter with sane JSON error output. Counts per client IP. */
export function createRateLimiter(options: Partial<RateLimitOptions> = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later' },
    ...options
  });
}

/** Baseline limiter for authenticated/general routes. */
export const standardRateLimiter = createRateLimiter();

/**
 * Tighter limiter for brute-force-prone unauthenticated routes (token
 * issuance, public endpoints with no auth in front of them).
 */
export const strictRateLimiter = createRateLimiter({ max: 20 });
