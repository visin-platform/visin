import { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../logging/logger';
import { looksLikeApiKey } from './crypto';
import { verifyApiKey } from './service';
import { readScope, writeScope, type ApiKeyDomain, type ApiKeyScope } from './types';

/**
 * Request-scoped facts about the key a request arrived on.
 *
 * Absent on ordinary session requests, which is itself the signal a handler
 * needs: `req.apiKey` being set means software is acting, not a person at a
 * keyboard.
 */
export interface ApiKeyContext {
  /** the key document's id — stable, unlike the token, so it is what to log */
  keyId: string;
  scopes: ApiKeyScope[];
  /** what the owner called it */
  label: string;
  /** the scope this particular request had to carry */
  required: ApiKeyScope;
}

export interface ApiKeyAuthOptions {
  /**
   * Sub-paths that are reads despite arriving as a POST.
   *
   * Matched against `req.path`, which is relative to where the middleware is
   * mounted — so a comparison endpoint mounted under `/api/trainings` is
   * `/compare` here. Without this a read-only key could not call
   * `POST /api/trainings/compare`, which reads two runs and writes nothing.
   */
  readPaths?: RegExp[];
}

/** Reads, by method. Everything else is treated as a write. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authenticate an API key, and gate it on the scope the request needs.
 *
 * Mounted per route group rather than once globally, because a service can
 * serve more than one domain — vision-service answers for both `vision` and
 * `dataset` — and because forgetting to mount it fails closed: a new route
 * group without this middleware simply does not accept API keys, and the JWT
 * middleware behind it answers 401. The opposite arrangement (one global mount
 * that guesses the domain) fails open on exactly the same mistake.
 *
 * Runs *before* `authenticateToken`/`optionalAuth` and cooperates with them
 * through the `if (req.user) return next()` guard both already begin with, so
 * the JWT path stays synchronous and untouched.
 *
 * The required scope is derived from the HTTP method rather than declared per
 * route. Coarse, but a route added later is gated without its author having to
 * remember this file exists — and the alternative, a per-route list, is wrong
 * precisely on the route somebody forgot to add.
 */
export function apiKeyAuth(domain: ApiKeyDomain, options: ApiKeyAuthOptions = {}): RequestHandler {
  const readPaths = options.readPaths ?? [];

  return async function apiKeyAuthHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (req.user) {
      next();
      return;
    }

    // Header only. An API key is pasted into a config file by a person and sent
    // by software; it is never a browser cookie, and accepting it as one would
    // make it usable in a cross-site request.
    const token = req.headers.authorization?.replace('Bearer ', '');

    // Not one of ours: a JWT, or vision-service's project-scoped API token.
    // Leave it to whichever middleware owns it.
    if (!looksLikeApiKey(token)) {
      next();
      return;
    }

    const verification = await verifyApiKey(token);
    if (!verification.ok) {
      // The client is told one thing; the log gets the real reason, which is
      // the difference between "someone is guessing" and "this expired".
      logger.warn('API key rejected', { rejection: verification.rejection });
      res.status(401).json({ success: false, message: 'Invalid or expired credentials' });
      return;
    }

    const isRead =
      READ_METHODS.has(req.method) || readPaths.some((pattern) => pattern.test(req.path));
    const required = isRead ? readScope(domain) : writeScope(domain);

    const scopes = verification.scopes ?? [];
    if (!scopes.includes(required)) {
      logger.warn('API key missing required scope', {
        keyId: verification.keyId,
        required,
        held: scopes
      });
      res.status(403).json({
        success: false,
        // Named precisely, because the fix is a new key rather than a retry —
        // and a caller told only "forbidden" will retry.
        message: `This API key does not carry the "${required}" scope.`
      });
      return;
    }

    req.user = {
      id: verification.userId as string,
      email: verification.userEmail,
      name: verification.userName
    };
    req.apiKey = {
      keyId: verification.keyId as string,
      scopes,
      label: verification.label as string,
      required
    };

    next();
  };
}
