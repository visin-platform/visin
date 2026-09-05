import { createHmac } from 'crypto';
import type { Request, Response } from 'express';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  findClient: jest.fn(),
  registerClient: jest.fn(),
  issueAuthorizationCode: jest.fn(),
  redeemAuthorizationCode: jest.fn(),
  issueRefreshToken: jest.fn(),
  redeemRefreshToken: jest.fn(),
  revokeRefreshTokensForUser: jest.fn(),
  listConnections: jest.fn(),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  findClient,
  issueAuthorizationCode,
  issueRefreshToken,
  listConnections,
  redeemAuthorizationCode,
  redeemRefreshToken,
  registerClient,
  revokeRefreshTokensForUser,
} from '@visin/backend-core';
import {
  authorizationServerMetadata,
  authorize,
  authorizeDecision,
  getConnections,
  registerOAuthClient,
  revokeConnection,
  token,
} from '../../controllers/oauthController';

const mocked = {
  findClient: findClient as unknown as jest.Mock,
  registerClient: registerClient as unknown as jest.Mock,
  issueCode: issueAuthorizationCode as unknown as jest.Mock,
  redeemCode: redeemAuthorizationCode as unknown as jest.Mock,
  issueRefresh: issueRefreshToken as unknown as jest.Mock,
  redeemRefresh: redeemRefreshToken as unknown as jest.Mock,
  revoke: revokeRefreshTokensForUser as unknown as jest.Mock,
  connections: listConnections as unknown as jest.Mock,
};

const SECRET = 'test-secret';
const ISSUER = 'https://auth-api.visin.eu';
const RESOURCE = 'https://mcp.visin.eu';
const CHALLENGE = 'a-code-challenge';
const REDIRECT = 'https://claude.ai/callback';

const CLIENT = { clientId: 'vsn-client-abc', clientName: 'Claude', redirectUris: [REDIRECT] };

const consentToken = (userId = 'u1', clientId = CLIENT.clientId, challenge = CHALLENGE) =>
  createHmac('sha256', SECRET).update(`consent:${userId}:${clientId}:${challenge}`).digest('hex');

type MockRes = Response & {
  json: jest.Mock;
  status: jest.Mock;
  redirect: jest.Mock;
  send: jest.Mock;
  type: jest.Mock;
};

const makeRes = (): MockRes => {
  const res = {
    json: jest.fn(),
    status: jest.fn(),
    redirect: jest.fn(),
    send: jest.fn(),
    type: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ query: {}, body: {}, params: {}, originalUrl: '/oauth/authorize', ...overrides }) as unknown as Request;

const authorizeQuery = (over: Record<string, string | undefined> = {}) => ({
  client_id: CLIENT.clientId,
  redirect_uri: REDIRECT,
  response_type: 'code',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
  resource: RESOURCE,
  scope: 'vision:read dataset:read',
  ...over,
});

const decisionBody = (over: Record<string, unknown> = {}) => ({
  decision: 'approve',
  client_id: CLIENT.clientId,
  redirect_uri: REDIRECT,
  resource: RESOURCE,
  code_challenge: CHALLENGE,
  requested_scope: 'vision:read dataset:read',
  consent_token: consentToken(),
  scope: ['vision:read', 'dataset:read'],
  ...over,
});

const user = { id: 'u1', email: 'a@b.com', name: 'A B' };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
  process.env.AUTH_SERVICE_PUBLIC_URL = ISSUER;
  process.env.MCP_PUBLIC_URL = RESOURCE;
  process.env.AUTH_FRONT_URL = 'https://auth.visin.eu';
  mocked.findClient.mockResolvedValue(CLIENT);
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.AUTH_SERVICE_PUBLIC_URL;
  delete process.env.MCP_PUBLIC_URL;
  delete process.env.AUTH_FRONT_URL;
});

describe('authorizationServerMetadata', () => {
  it('advertises S256 only and a public-client token endpoint', () => {
    // OAuth 2.1 removes `plain`, and a public client without PKCE is an
    // intercepted code away from being impersonated.
    const res = makeRes();
    authorizationServerMetadata(makeReq(), res);

    expect(res.json.mock.calls[0][0]).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth/authorize`,
      token_endpoint: `${ISSUER}/oauth/token`,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      authorization_response_iss_parameter_supported: true,
    });
  });
});

describe('registerOAuthClient', () => {
  it('registers a client and reports it as a public client', async () => {
    mocked.registerClient.mockResolvedValue(CLIENT);
    const res = makeRes();

    await registerOAuthClient(makeReq({ body: { client_name: 'Claude', redirect_uris: [REDIRECT] } }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      client_id: CLIENT.clientId,
      token_endpoint_auth_method: 'none',
    });
  });

  it('allows a loopback callback, which is how local MCP clients work', async () => {
    mocked.registerClient.mockResolvedValue({ ...CLIENT, redirectUris: ['http://127.0.0.1:6274/cb'] });

    await registerOAuthClient(
      makeReq({ body: { redirect_uris: ['http://127.0.0.1:6274/cb'] } }),
      makeRes()
    );

    expect(mocked.registerClient).toHaveBeenCalled();
  });

  it('refuses plain http anywhere else — a code would travel in the clear', async () => {
    await expect(
      registerOAuthClient(makeReq({ body: { redirect_uris: ['http://evil.com/cb'] } }), makeRes())
    ).rejects.toThrow(/https or loopback/);
  });

  it('refuses a registration with no callback at all', async () => {
    await expect(
      registerOAuthClient(makeReq({ body: { client_name: 'X' } }), makeRes())
    ).rejects.toThrow(/redirect_uris is required/);
  });
});

describe('authorize', () => {
  it('sends an unauthenticated visitor through the ordinary login and back', async () => {
    // There is exactly one way to sign in to Visin, and this is not it.
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery() }), res);

    expect(res.redirect.mock.calls[0][0]).toBe(
      `https://auth.visin.eu?redirect_uri=${encodeURIComponent(`${ISSUER}/oauth/authorize`)}`
    );
  });

  it('renders a consent form naming the app and each permission', async () => {
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    const html = res.send.mock.calls[0][0];
    expect(html).toContain('Connect Claude');
    expect(html).toContain('Read your projects and training runs');
    expect(html).toContain('Read your datasets');
    expect(html).toContain('Signed in as a@b.com');
  });

  it('offers each scope as a checkbox the approver can untick', async () => {
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    const html = res.send.mock.calls[0][0];
    expect(html).toContain('name="scope" value="vision:read" checked');
    expect(html).toContain('name="scope" value="dataset:read" checked');
  });

  it('carries a consent token bound to this user and request', async () => {
    // Without it the decision endpoint is a plain cookie-authenticated POST that
    // any page on the internet could submit for a signed-in visitor.
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    expect(res.send.mock.calls[0][0]).toContain(`value="${consentToken()}"`);
  });

  it('escapes a client name rather than rendering it', async () => {
    mocked.findClient.mockResolvedValue({ ...CLIENT, clientName: '<script>alert(1)</script>' });
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    const html = res.send.mock.calls[0][0];
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it.each([
    ['no client_id', { client_id: undefined }, /client_id is required/],
    ['no redirect_uri', { redirect_uri: undefined }, /redirect_uri is required/],
    ['the wrong response_type', { response_type: 'token' }, /response_type/],
    ['no PKCE challenge', { code_challenge: undefined }, /code_challenge is required/],
    ['plain PKCE', { code_challenge_method: 'plain' }, /must be S256/],
    ['no resource', { resource: undefined }, /resource is required/],
    ['a resource we do not issue for', { resource: 'https://evil.com' }, /Unknown resource/],
    ['no recognisable scope', { scope: 'made:up' }, /At least one known scope/],
  ])('refuses a request with %s, shown to the user rather than redirected', async (_label, over, message) => {
    await expect(authorize(makeReq({ query: authorizeQuery(over), user }), makeRes())).rejects.toThrow(
      message
    );
  });

  it('refuses a redirect_uri the client never registered', async () => {
    // Bouncing to an unverified URI is how an open redirect is built.
    await expect(
      authorize(makeReq({ query: authorizeQuery({ redirect_uri: 'https://evil.com/cb' }), user }), makeRes())
    ).rejects.toThrow(/does not match the one registered/);
  });

  it('refuses an unknown client', async () => {
    mocked.findClient.mockResolvedValue(null);

    await expect(authorize(makeReq({ query: authorizeQuery(), user }), makeRes())).rejects.toThrow(
      /Unknown client_id/
    );
  });

  it('renders a scope it has no wording for rather than dropping it', async () => {
    // A scope can be added to the shared list before this file learns to phrase
    // it; showing the raw name is worse than a sentence but far better than
    // asking someone to approve a permission that is invisible on the screen.
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery({ scope: 'label:write' }), user }), res);

    expect(res.send.mock.calls[0][0]).toContain('Change your labelling jobs');
  });

  it('falls back to production URLs when none are configured', async () => {
    delete process.env.AUTH_SERVICE_PUBLIC_URL;
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.MCP_PUBLIC_URL;
    delete process.env.AUTH_FRONT_URL;
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery() }), res);

    expect(res.redirect.mock.calls[0][0]).toContain('https://auth.visin.eu');
    expect(res.redirect.mock.calls[0][0]).toContain(encodeURIComponent('https://auth-api.visin.eu'));
  });

  it('trims a trailing slash off a configured URL', async () => {
    // Otherwise the issuer on the token and the one in the metadata differ by a
    // character, and a client checking `iss` rejects a perfectly good response.
    process.env.AUTH_SERVICE_PUBLIC_URL = `${ISSUER}/`;
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    expect(res.send.mock.calls[0][0]).toContain(`action="${ISSUER}/oauth/authorize"`);
  });

  it('names the app generically when its record has gone', async () => {
    mocked.findClient
      .mockResolvedValueOnce(CLIENT) // validation
      .mockResolvedValueOnce(null); // the lookup that names it
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user }), res);

    expect(res.send.mock.calls[0][0]).toContain('Connect an application');
  });

  it('copes with a session carrying no email', async () => {
    const res = makeRes();

    await authorize(makeReq({ query: authorizeQuery(), user: { id: 'u1' } }), res);

    expect(res.send.mock.calls[0][0]).toContain('Signed in as ');
  });
});

describe('authorizeDecision', () => {
  it('issues a code for what was ticked, and names itself on the way back', async () => {
    mocked.issueCode.mockResolvedValue('the-code');
    const res = makeRes();

    await authorizeDecision(makeReq({ body: decisionBody({ state: 'xyz' }), user }), res);

    expect(mocked.issueCode).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', scopes: ['vision:read', 'dataset:read'], resource: RESOURCE })
    );
    const back = new URL(res.redirect.mock.calls[0][0]);
    expect(back.searchParams.get('code')).toBe('the-code');
    expect(back.searchParams.get('state')).toBe('xyz');
    // RFC 9207: lets the client detect a mix-up attack.
    expect(back.searchParams.get('iss')).toBe(ISSUER);
  });

  it('grants only what was ticked, so unticking a box really narrows the grant', async () => {
    mocked.issueCode.mockResolvedValue('the-code');

    await authorizeDecision(
      makeReq({ body: decisionBody({ scope: ['vision:read'] }), user }),
      makeRes()
    );

    expect(mocked.issueCode.mock.calls[0][0].scopes).toEqual(['vision:read']);
  });

  it('handles a single ticked box, which arrives as a string not an array', async () => {
    mocked.issueCode.mockResolvedValue('the-code');

    await authorizeDecision(makeReq({ body: decisionBody({ scope: 'vision:read' }), user }), makeRes());

    expect(mocked.issueCode.mock.calls[0][0].scopes).toEqual(['vision:read']);
  });

  it('cannot be widened past what the client asked for and the user saw', async () => {
    // The form is the approver's, but the request carrying it is the client's.
    mocked.issueCode.mockResolvedValue('the-code');

    await authorizeDecision(
      makeReq({
        body: decisionBody({ scope: ['vision:read', 'vision:write', 'label:write'] }),
        user,
      }),
      makeRes()
    );

    expect(mocked.issueCode.mock.calls[0][0].scopes).toEqual(['vision:read']);
  });

  it('treats approving nothing as a denial', async () => {
    // The connection would authenticate and then be refused every call.
    const res = makeRes();

    await authorizeDecision(makeReq({ body: decisionBody({ scope: [] }), user }), res);

    const back = new URL(res.redirect.mock.calls[0][0]);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(mocked.issueCode).not.toHaveBeenCalled();
  });

  it('redirects with access_denied when the user cancels', async () => {
    const res = makeRes();

    await authorizeDecision(makeReq({ body: decisionBody({ decision: 'deny' }), user }), res);

    expect(new URL(res.redirect.mock.calls[0][0]).searchParams.get('error')).toBe('access_denied');
    expect(mocked.issueCode).not.toHaveBeenCalled();
  });

  it('refuses a forged consent token outright rather than redirecting', async () => {
    // Sending an error to the client's URI would tell an attacker their attempt
    // was received.
    await expect(
      authorizeDecision(makeReq({ body: decisionBody({ consent_token: 'forged' }), user }), makeRes())
    ).rejects.toThrow(/not valid/);
    expect(mocked.issueCode).not.toHaveBeenCalled();
  });

  it('refuses a consent token minted for another user', async () => {
    await expect(
      authorizeDecision(
        makeReq({ body: decisionBody({ consent_token: consentToken('someone-else') }), user }),
        makeRes()
      )
    ).rejects.toThrow(/not valid/);
  });

  it('refuses a consent token reused for a different authorization', async () => {
    await expect(
      authorizeDecision(
        makeReq({
          body: decisionBody({ consent_token: consentToken('u1', CLIENT.clientId, 'another-challenge') }),
          user,
        }),
        makeRes()
      )
    ).rejects.toThrow(/not valid/);
  });

  it('refuses a decision for a redirect_uri the client never registered', async () => {
    await expect(
      authorizeDecision(
        makeReq({ body: decisionBody({ redirect_uri: 'https://evil.com/cb' }), user }),
        makeRes()
      )
    ).rejects.toThrow(/Unknown client or redirect_uri/);
  });

  it('treats a form with no scope field at all as approving nothing', async () => {
    const res = makeRes();

    await authorizeDecision(makeReq({ body: decisionBody({ scope: undefined }), user }), res);

    expect(new URL(res.redirect.mock.calls[0][0]).searchParams.get('error')).toBe('access_denied');
  });

  it('stores an empty identity snapshot when the session has no name', async () => {
    mocked.issueCode.mockResolvedValue('the-code');

    await authorizeDecision(makeReq({ body: decisionBody(), user: { id: 'u1' } }), makeRes());

    expect(mocked.issueCode.mock.calls[0][0]).toMatchObject({ userEmail: '', userName: '' });
  });

  it('redirects with invalid_request when the form is missing its bindings', async () => {
    const res = makeRes();

    await authorizeDecision(
      makeReq({ body: decisionBody({ code_challenge: undefined }), user }),
      res
    );

    expect(new URL(res.redirect.mock.calls[0][0]).searchParams.get('error')).toBe('invalid_request');
  });
});

describe('token — authorization_code', () => {
  const granted = {
    userId: 'u1',
    userEmail: 'a@b.com',
    userName: 'A B',
    scopes: ['vision:read'],
    resource: RESOURCE,
  };

  it('exchanges a code for an access token and a refresh token', async () => {
    mocked.redeemCode.mockResolvedValue({ ok: true, code: granted });
    mocked.issueRefresh.mockResolvedValue({ token: 'refresh-1' });
    const res = makeRes();

    await token(
      makeReq({
        body: {
          grant_type: 'authorization_code',
          code: 'the-code',
          redirect_uri: REDIRECT,
          client_id: CLIENT.clientId,
          code_verifier: 'the-verifier',
        },
      }),
      res
    );

    expect(res.json.mock.calls[0][0]).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'vision:read',
      refresh_token: 'refresh-1',
    });
  });

  it('answers a bad code with invalid_grant, which a client knows how to act on', async () => {
    mocked.redeemCode.mockResolvedValue({ ok: false, rejection: 'pkce-failed' });
    const res = makeRes();

    await token(
      makeReq({
        body: {
          grant_type: 'authorization_code',
          code: 'the-code',
          redirect_uri: REDIRECT,
          client_id: CLIENT.clientId,
          code_verifier: 'wrong',
        },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('invalid_grant');
    // Never says which check failed — that would help someone probing.
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('pkce');
  });

  it('names the app generically when its record has gone', async () => {
    // The token still has to carry a name: nothing downstream can resolve a
    // client id, and an audit line reading "vsn-client-abc called X" is not one
    // a person can act on.
    mocked.redeemCode.mockResolvedValue({ ok: true, code: granted });
    mocked.issueRefresh.mockResolvedValue({ token: 'refresh-1' });
    mocked.findClient.mockResolvedValue(null);
    const res = makeRes();

    await token(
      makeReq({
        body: {
          grant_type: 'authorization_code',
          code: 'the-code',
          redirect_uri: REDIRECT,
          client_id: CLIENT.clientId,
          code_verifier: 'the-verifier',
        },
      }),
      res
    );

    expect(res.json.mock.calls[0][0].access_token).toEqual(expect.any(String));
  });

  it('requires the PKCE verifier', async () => {
    const res = makeRes();

    await token(
      makeReq({
        body: { grant_type: 'authorization_code', code: 'c', redirect_uri: REDIRECT, client_id: CLIENT.clientId },
      }),
      res
    );

    expect(res.json.mock.calls[0][0].error).toBe('invalid_request');
  });
});

describe('token — refresh_token', () => {
  it('rotates, handing back a replacement the client must store', async () => {
    mocked.redeemRefresh.mockResolvedValue({
      ok: true,
      userId: 'u1',
      scopes: ['vision:read'],
      resource: RESOURCE,
      rotatedToken: 'refresh-2',
    });
    const res = makeRes();

    await token(
      makeReq({ body: { grant_type: 'refresh_token', refresh_token: 'refresh-1', client_id: CLIENT.clientId } }),
      res
    );

    expect(res.json.mock.calls[0][0].refresh_token).toBe('refresh-2');
  });

  it('refuses a reused token, which the service has already treated as theft', async () => {
    mocked.redeemRefresh.mockResolvedValue({ ok: false, reused: true });
    const res = makeRes();

    await token(
      makeReq({ body: { grant_type: 'refresh_token', refresh_token: 'stale', client_id: CLIENT.clientId } }),
      res
    );

    expect(res.json.mock.calls[0][0].error).toBe('invalid_grant');
  });

  it('requires the refresh token itself', async () => {
    const res = makeRes();
    await token(makeReq({ body: { grant_type: 'refresh_token', client_id: CLIENT.clientId } }), res);
    expect(res.json.mock.calls[0][0].error).toBe('invalid_request');
  });
});

describe('token — bad requests', () => {
  it('requires a client_id', async () => {
    const res = makeRes();
    await token(makeReq({ body: { grant_type: 'authorization_code' } }), res);
    expect(res.json.mock.calls[0][0].error).toBe('invalid_client');
  });

  it('names an unsupported grant type', async () => {
    const res = makeRes();
    await token(makeReq({ body: { grant_type: 'password', client_id: CLIENT.clientId } }), res);
    expect(res.json.mock.calls[0][0].error).toBe('unsupported_grant_type');
  });
});

describe('connections', () => {
  it('lists what the caller has connected', async () => {
    mocked.connections.mockResolvedValue([{ clientId: CLIENT.clientId, clientName: 'Claude' }]);
    const res = makeRes();

    await getConnections(makeReq({ user }), res);

    expect(mocked.connections).toHaveBeenCalledWith('u1');
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  it('disconnects one app', async () => {
    mocked.revoke.mockResolvedValue(1);
    const res = makeRes();

    await revokeConnection(makeReq({ user, params: { clientId: CLIENT.clientId } }), res);

    expect(mocked.revoke).toHaveBeenCalledWith('u1', CLIENT.clientId);
    expect(res.json.mock.calls[0][0].data).toEqual({ clientId: CLIENT.clientId, revoked: 1 });
  });

  it('404s when there was nothing live to disconnect', async () => {
    mocked.revoke.mockResolvedValue(0);

    await expect(
      revokeConnection(makeReq({ user, params: { clientId: 'nope' } }), makeRes())
    ).rejects.toThrow(/No active connection/);
  });
});
