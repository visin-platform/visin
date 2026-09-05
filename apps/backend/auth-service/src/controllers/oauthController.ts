import { createHmac, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import {
  API_KEY_SCOPES,
  BadRequestError,
  NotFoundError,
  findClient,
  isRegisteredRedirect,
  issueAuthorizationCode,
  issueRefreshToken,
  listConnections,
  logger,
  mintAccessToken,
  parseScopes,
  redeemAuthorizationCode,
  redeemRefreshToken,
  registerClient,
  requireEnv,
  revokeRefreshTokensForUser
} from '@visin/backend-core';
import type { ApiKeyScope } from '@visin/backend-core';

/**
 * OAuth 2.1 authorization server, for assistants connecting over MCP.
 *
 * Lives in auth-service because it already owns identity: the user is
 * authenticated here by the same session the web app uses, so consent is
 * something they give while signed in rather than a second set of credentials.
 */

const issuer = (): string =>
  (process.env.AUTH_SERVICE_PUBLIC_URL || process.env.AUTH_SERVICE_URL || 'https://auth-api.visin.eu').replace(/\/$/, '');

/** The one resource this server issues tokens for. */
const mcpResource = (): string =>
  (process.env.MCP_PUBLIC_URL || 'https://mcp.visin.eu').replace(/\/$/, '');

const authFrontUrl = (): string =>
  (process.env.AUTH_FRONT_URL || 'https://auth.visin.eu').replace(/\/$/, '');

/**
 * RFC 8414 metadata: how a client discovers where to send the user and where to
 * exchange the code. Served unauthenticated at the issuer's root, because it is
 * the first thing a client reads and it reveals nothing.
 */
export const authorizationServerMetadata = (_req: Request, res: Response): void => {
  const base = issuer();

  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    scopes_supported: API_KEY_SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // S256 only: OAuth 2.1 removes `plain`, and a public client without PKCE is
    // an intercepted code away from being impersonated.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true
  });
};

/**
 * RFC 7591 Dynamic Client Registration.
 *
 * Open, and deliberately so: assistants register themselves, and there is no
 * plausible flow where a person pre-provisions Claude, ChatGPT and Gemini by
 * hand. Registration grants nothing on its own — a client id only lets you ask
 * a user for consent, and the user is who decides.
 */
export const registerOAuthClient = async (req: Request, res: Response): Promise<void> => {
  const { client_name: clientName, redirect_uris: redirectUris } = req.body as {
    client_name?: string;
    redirect_uris?: unknown;
  };

  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new BadRequestError('redirect_uris is required');
  }

  const uris = redirectUris.map(String);
  for (const uri of uris) {
    // http is allowed only for loopback, which is how a local MCP client and
    // the inspector call back; anything else on the public internet must be
    // https, or an authorization code travels in the clear.
    const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(uri);
    if (!uri.startsWith('https://') && !isLoopback) {
      throw new BadRequestError(`redirect_uri must be https or loopback: ${uri}`);
    }
  }

  const client = await registerClient({
    clientName: clientName || 'Unnamed client',
    redirectUris: uris
  });
  logger.info('OAuth client registered', {
    clientId: client.clientId,
    clientName: client.clientName
  });

  res.status(201).json({
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code']
  });
};

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  state?: string;
  scopes: ApiKeyScope[];
  resource: string;
  codeChallenge: string;
}

/**
 * Validate an authorization request before anything is shown to the user.
 *
 * Errors split in two, and the split matters. A bad `client_id` or
 * `redirect_uri` must be shown to the *user*, never redirected — bouncing to an
 * unverified URI is how an open redirect is built. Everything else is the
 * client's fault and goes back to the (now verified) redirect URI as an error.
 */
async function validateAuthorizeRequest(req: Request): Promise<AuthorizeParams> {
  const {
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: responseType,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    resource,
    scope,
    state
  } = req.query as Record<string, string | undefined>;

  if (!clientId) throw new BadRequestError('client_id is required');
  if (!redirectUri) throw new BadRequestError('redirect_uri is required');

  const client = await findClient(clientId);
  if (!client) throw new BadRequestError('Unknown client_id');
  if (!isRegisteredRedirect(client, redirectUri)) {
    throw new BadRequestError('redirect_uri does not match the one registered for this client');
  }

  if (responseType !== 'code') throw new BadRequestError('response_type must be "code"');
  if (!codeChallenge) throw new BadRequestError('code_challenge is required');
  if (codeChallengeMethod !== 'S256') {
    throw new BadRequestError('code_challenge_method must be S256');
  }

  // RFC 8707: the token is bound to whatever is named here, so it has to be a
  // resource this server actually issues for.
  if (!resource) throw new BadRequestError('resource is required');
  if (resource.replace(/\/$/, '') !== mcpResource()) {
    throw new BadRequestError('Unknown resource');
  }

  const scopes = parseScopes(scope);
  if (scopes.length === 0) throw new BadRequestError('At least one known scope is required');

  return { clientId, redirectUri, state, scopes, resource: mcpResource(), codeChallenge };
}

/**
 * A token binding the consent form to this user and this request.
 *
 * Without it the decision endpoint is a plain cookie-authenticated POST, and
 * any page on the internet could submit one on a signed-in visitor's behalf —
 * granting an authorization code to a client the user never saw. Deriving it
 * rather than storing it keeps the endpoint stateless; binding it to the user
 * stops an attacker minting one from their own session, and to the code
 * challenge stops it being reused for a different authorization.
 */
const consentToken = (userId: string, clientId: string, codeChallenge: string): string =>
  createHmac('sha256', requireEnv('JWT_SECRET'))
    .update(`consent:${userId}:${clientId}:${codeChallenge}`)
    .digest('hex');

const consentTokenValid = (
  presented: unknown,
  userId: string,
  clientId: string,
  codeChallenge: string
): boolean => {
  if (typeof presented !== 'string') return false;
  const expected = Buffer.from(consentToken(userId, clientId, codeChallenge));
  const given = Buffer.from(presented);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
};

/** What a scope means, in the terms someone approving it would think in. */
/**
 * What a scope means, in the terms someone approving it would think in.
 *
 * Phrased per scope rather than assembled from "Read"/"Change" plus an area
 * name: `analysis:write` came out as "Change analysis", which reads as editing
 * existing notes when it means writing new ones. A consent screen is the one
 * place the wording has to be right, since it is what the person is agreeing to.
 *
 * Typed against `ApiKeyScope`, so adding a scope to backend-core and forgetting
 * to phrase it here is a compile error rather than a blank line on the screen.
 * That is why there is no runtime fallback: `parseScopes` has already dropped
 * anything undefined by the time a scope reaches here, so a fallback could only
 * ever be dead code.
 */
const SCOPE_LABELS: Record<ApiKeyScope, string> = {
  'vision:read': 'Read your projects and training runs',
  'vision:write': 'Create projects, and rename or retag runs',
  'dataset:read': 'Read your datasets',
  'dataset:write': 'Change your datasets',
  'label:read': 'Read your labelling jobs',
  'label:write': 'Change your labelling jobs',
  'analysis:read': 'Read analysis recorded about your work',
  'analysis:write': 'Record analysis on your projects'
};

const scopeLabel = (scope: ApiKeyScope): string => SCOPE_LABELS[scope];

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

/**
 * The authorization endpoint.
 *
 * An unauthenticated visitor is sent through the ordinary login and returned
 * here, so there is exactly one way to sign in to Visin and this is not it.
 */
export const authorize = async (req: Request, res: Response): Promise<void> => {
  const params = await validateAuthorizeRequest(req);

  if (!req.user) {
    const returnTo = `${issuer()}${req.originalUrl}`;
    res.redirect(`${authFrontUrl()}?redirect_uri=${encodeURIComponent(returnTo)}`);
    return;
  }

  const client = await findClient(params.clientId);

  // Server-rendered, because a consent screen must come from the authorization
  // server itself — a page the client could influence is not consent.
  //
  // Each requested scope is a checkbox rather than a fixed list: the client
  // says what it would like, and the person approving decides what it gets.
  // The decision handler takes the scopes from this form, so unticking one is
  // a real narrowing rather than a cosmetic choice.
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect to Visin</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f6f6f7;margin:0;padding:2rem;color:#1a1a1a}
  .card{max-width:26rem;margin:2rem auto;background:#fff;border-radius:12px;padding:1.75rem;
        box-shadow:0 1px 3px rgba(0,0,0,.1)}
  h1{font-size:1.25rem;margin:0 0 .25rem}
  p.sub{color:#666;margin:0 0 1.25rem;font-size:.9rem}
  .scopes{margin:0 0 1.25rem}
  .scope{display:flex;align-items:center;gap:.55rem;padding:.55rem .75rem;background:#f2f7ff;
         border:1px solid #e3ecf9;border-radius:8px;margin-bottom:.4rem;font-size:.9rem}
  .scope input{margin:0}
  .row{display:flex;gap:.6rem}
  button{flex:1;padding:.7rem;border-radius:8px;border:0;font-size:.95rem;cursor:pointer}
  .approve{background:#1a73e8;color:#fff}
  .deny{background:#eee;color:#333}
  .who{font-size:.8rem;color:#888;margin-top:1rem;text-align:center}
  .note{font-size:.8rem;color:#777;margin:0 0 1.25rem}
</style></head><body>
<div class="card">
  <h1>Connect ${escapeHtml(client?.clientName ?? 'an application')}</h1>
  <p class="sub">It is asking to act on your Visin account. Untick anything you would rather it could not do.</p>
  <form method="POST" action="${issuer()}/oauth/authorize">
    <div class="scopes">
      ${params.scopes
        .map(
          scope => `<label class="scope">
        <input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked>
        <span>${escapeHtml(scopeLabel(scope))}</span>
      </label>`
        )
        .join('')}
    </div>
    <p class="note">It can only reach what you can already see. Private projects belonging to
    other people stay invisible to it.</p>
    <input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
    <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
    <input type="hidden" name="resource" value="${escapeHtml(params.resource)}">
    <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
    <input type="hidden" name="requested_scope" value="${escapeHtml(params.scopes.join(' '))}">
    <input type="hidden" name="state" value="${escapeHtml(params.state ?? '')}">
    <input type="hidden" name="consent_token" value="${consentToken(req.user.id, params.clientId, params.codeChallenge)}">
    <div class="row">
      <button type="submit" name="decision" value="deny" class="deny">Cancel</button>
      <button type="submit" name="decision" value="approve" class="approve">Connect</button>
    </div>
  </form>
  <p class="who">Signed in as ${escapeHtml(req.user.email ?? '')}</p>
</div></body></html>`);
};

/**
 * What the user decided.
 *
 * The scopes are taken from this form rather than from the original query, so
 * what is stored on the code is exactly what was on screen when they pressed
 * the button.
 */
export const authorizeDecision = async (req: Request, res: Response): Promise<void> => {
  const {
    decision,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    code_challenge: codeChallenge,
    requested_scope: requestedScope,
    consent_token: presentedConsentToken,
    state
  } = req.body as Record<string, string | undefined>;

  const client = clientId ? await findClient(clientId) : null;
  if (!client || !redirectUri || !isRegisteredRedirect(client, redirectUri)) {
    throw new BadRequestError('Unknown client or redirect_uri');
  }

  const back = new URL(redirectUri);
  if (state) back.searchParams.set('state', state);
  // RFC 9207: naming ourselves lets the client detect a mix-up attack.
  back.searchParams.set('iss', issuer());

  if (decision !== 'approve') {
    back.searchParams.set('error', 'access_denied');
    res.redirect(back.toString());
    return;
  }

  if (!req.user || !codeChallenge || !resource) {
    back.searchParams.set('error', 'invalid_request');
    res.redirect(back.toString());
    return;
  }

  // The form must be the one this server rendered for this user. A submission
  // that fails here is not a user decision, so it is refused outright rather
  // than redirected — sending an error to the client's URI would tell an
  // attacker their attempt was received.
  if (!consentTokenValid(presentedConsentToken, req.user.id, client.clientId, codeChallenge)) {
    logger.warn('OAuth consent rejected: bad or missing consent token', {
      clientId: client.clientId,
      userId: req.user.id
    });
    throw new BadRequestError('This consent form is not valid. Start the connection again.');
  }

  // Checkboxes: absent when none were ticked, a string for one, an array for
  // several. Intersected with what was originally requested, so a tampered
  // form cannot approve a scope the client never asked for and the user never
  // saw — the checkboxes can only narrow.
  const requested = new Set(parseScopes(requestedScope));
  const ticked = ([] as string[]).concat(req.body.scope ?? []);
  const scopes = parseScopes(ticked.join(' ')).filter(scope => requested.has(scope));

  if (scopes.length === 0) {
    // Approving nothing is a denial with extra steps: the connection would
    // authenticate and then be refused every call it made.
    back.searchParams.set('error', 'access_denied');
    back.searchParams.set('error_description', 'No permissions were granted');
    res.redirect(back.toString());
    return;
  }

  const code = await issueAuthorizationCode({
    clientId: client.clientId,
    userId: req.user.id,
    userEmail: req.user.email ?? '',
    userName: req.user.name ?? '',
    redirectUri,
    scopes,
    resource: mcpResource(),
    codeChallenge
  });

  logger.info('OAuth authorization granted', {
    clientId: client.clientId,
    userId: req.user.id,
    scopes
  });

  back.searchParams.set('code', code);
  res.redirect(back.toString());
};

const tokenError = (res: Response, error: string, description: string): void => {
  res.status(400).json({ error, error_description: description });
};

/**
 * The token endpoint: authorization codes and refresh tokens both land here.
 *
 * Errors use OAuth's own codes rather than the service's HttpError shapes,
 * because clients parse them — a client that gets `invalid_grant` knows to
 * start a fresh authorization, where a 400 with prose tells it nothing.
 */
export const token = async (req: Request, res: Response): Promise<void> => {
  const {
    grant_type: grantType,
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
    refresh_token: refreshToken
  } = req.body as Record<string, string | undefined>;

  if (!clientId) return tokenError(res, 'invalid_client', 'client_id is required');

  if (grantType === 'authorization_code') {
    if (!code || !redirectUri || !codeVerifier) {
      return tokenError(res, 'invalid_request', 'code, redirect_uri and code_verifier are required');
    }

    const result = await redeemAuthorizationCode(code, clientId, redirectUri, codeVerifier);
    if (!result.ok || !result.code) {
      logger.warn('OAuth code exchange rejected', { rejection: result.rejection, clientId });
      return tokenError(res, 'invalid_grant', 'The authorization code is not valid');
    }

    const granted = result.code;
    // Resolved once here and carried on the token: nothing downstream can turn
    // a client id into a name, and `jti` rotates hourly.
    const clientName = (await findClient(clientId))?.clientName ?? 'A connected app';

    const minted = mintAccessToken({
      userId: granted.userId,
      email: granted.userEmail,
      name: granted.userName,
      resource: granted.resource,
      issuer: issuer(),
      scopes: granted.scopes,
      clientId,
      clientName
    });

    const refresh = await issueRefreshToken({
      clientId,
      userId: granted.userId,
      scopes: granted.scopes,
      resource: granted.resource
    });

    res.json({
      access_token: minted.accessToken,
      token_type: 'Bearer',
      expires_in: minted.expiresIn,
      scope: minted.scope,
      refresh_token: refresh.token
    });
    return;
  }

  if (grantType === 'refresh_token') {
    if (!refreshToken) return tokenError(res, 'invalid_request', 'refresh_token is required');

    const result = await redeemRefreshToken(refreshToken, clientId);
    if (!result.ok || !result.userId) {
      if (result.reused) {
        logger.warn('Refresh token reuse detected; the grant has been revoked', { clientId });
      }
      return tokenError(res, 'invalid_grant', 'The refresh token is not valid');
    }

    const minted = mintAccessToken({
      userId: result.userId,
      // The identity snapshot lives on the code, not the refresh token; the
      // access token only needs these for display, and the id is what
      // authorizes anything.
      email: '',
      name: '',
      resource: result.resource as string,
      issuer: issuer(),
      scopes: result.scopes ?? [],
      clientId,
      clientName: (await findClient(clientId))?.clientName ?? 'A connected app'
    });

    res.json({
      access_token: minted.accessToken,
      token_type: 'Bearer',
      expires_in: minted.expiresIn,
      scope: minted.scope,
      // Rotated: the token just presented is dead, and the client must store
      // this one or its next refresh will read as a reuse.
      refresh_token: result.rotatedToken
    });
    return;
  }

  return tokenError(res, 'unsupported_grant_type', `Unsupported grant_type: ${grantType}`);
};

/**
 * The assistants a user has connected.
 *
 * Read from refresh tokens rather than a separate record, because a refresh
 * token *is* the connection: while one is live the assistant can keep minting
 * access tokens, and once it is gone the connection is over.
 */
export const getConnections = async (req: Request, res: Response): Promise<void> => {
  res.json({ success: true, data: await listConnections(req.user!.id) });
};

/**
 * Disconnect an assistant.
 *
 * Revoking the refresh token is what actually cuts it off. Any access token it
 * already holds keeps working until it expires — at most an hour — which is the
 * trade made when access tokens were made stateless, and worth saying plainly
 * in the UI rather than implying the cut is instant.
 */
export const revokeConnection = async (req: Request, res: Response): Promise<void> => {
  const clientId = String(req.params.clientId);
  const revoked = await revokeRefreshTokensForUser(req.user!.id, clientId);

  if (revoked === 0) throw new NotFoundError('No active connection for that application');

  logger.info('OAuth connection revoked', { userId: req.user!.id, clientId, revoked });
  res.json({ success: true, data: { clientId, revoked } });
};
