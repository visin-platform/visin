import { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../logging/logger';
import { looksLikeApiKey } from './crypto';
import { verifyApiKey } from './service';
import { looksLikeAccessToken, verifyAccessToken } from '../oauth/tokens';
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
   * The MCP resource an OAuth access token must be bound to (RFC 8707).
   * Defaults to `MCP_PUBLIC_URL`; a token minted for anything else is refused.
   */
  audience?: string;
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

/** What both verifiers answer with, so the handler treats them identically. */
interface Verified {
  ok: boolean;
  rejection?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  keyId?: string;
  label?: string;
  scopes?: ApiKeyScope[];
}

const verifiedAccessToken = (token: string, audience?: string): Verified => {
  const expected = (audience || process.env.MCP_PUBLIC_URL || 'https://mcp.visin.eu').replace(
    /\/$/,
    ''
  );
  const result = verifyAccessToken(token, expected);

  return {
    ok: result.ok,
    rejection: result.rejection,
    userId: result.userId,
    userEmail: result.email,
    userName: result.name,
    // The client id, not the token's `jti`: that rotates hourly and would make
    // one connection look like a new actor on every refresh.
    keyId: result.clientId,
    label: result.clientName,
    scopes: result.scopes
  };
};

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
 * an already verified API credential does not enter the session path.
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

    // Several credentials arrive in this header and only two are ours: a
    // `vsn_live_` key and an OAuth access token. Session JWTs and, on
    // vision-service, project-scoped API tokens belong to other middleware —
    // route on shape and leave those alone.
    const isKey = looksLikeApiKey(token);
    const isOAuth = !isKey && typeof token === 'string' && looksLikeAccessToken(token);

    if (!isKey && !isOAuth) {
      next();
      return;
    }

    /**
     * Both credentials collapse to the same facts: a user, a set of scopes, and
     * a name for the log.
     *
     * An OAuth token is verified here rather than trusted because mcp-service
     * forwarded it — the audience binding still has to hold, or a token minted
     * for another resource would work against this one. Verifying it here is
     * also what applies its scopes: read as a plain session JWT it carries
     * none, `req.user.id` lands undefined, and a read-only grant would slip
     * past the gate below entirely.
     */
    const verification = isKey
      ? await verifyApiKey(token)
      : verifiedAccessToken(token as string, options.audience);

    if (!verification.ok) {
      // The client is told one thing; the log gets the real reason, which is
      // the difference between "someone is guessing" and "this expired".
      logger.warn('Credential rejected', {
        kind: isKey ? 'api_key' : 'oauth',
        rejection: verification.rejection
      });
      res.status(401).json({ success: false, message: 'Invalid or expired credentials' });
      return;
    }

    const isRead =
      READ_METHODS.has(req.method) || readPaths.some((pattern) => pattern.test(req.path));
    const required = isRead ? readScope(domain) : writeScope(domain);

    const scopes = verification.scopes ?? [];
    if (!scopes.includes(required)) {
      logger.warn('Credential missing required scope', {
        keyId: verification.keyId,
        required,
        held: scopes
      });
      res.status(403).json({
        success: false,
        // Named precisely, because the fix is a new key rather than a retry —
        // and a caller told only "forbidden" will retry.
        message: `This credential does not carry the "${required}" scope.`
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
