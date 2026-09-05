jest.mock('../../apiKeys/service', () => ({ verifyApiKey: jest.fn() }));

import type { NextFunction, Request, Response } from 'express';
import { apiKeyAuth } from '../../apiKeys/middleware';
import { verifyApiKey } from '../../apiKeys/service';
import type { ApiKeyVerification } from '../../apiKeys/types';
import jwt from 'jsonwebtoken';
import { mintAccessToken } from '../../oauth/tokens';

const verify = verifyApiKey as unknown as jest.Mock;

const KEY = 'vsn_live_0123456789ab_a-secret-value-long-enough';

const VALID: ApiKeyVerification = {
  ok: true,
  userId: 'u1',
  userEmail: 'u1@example.com',
  userName: 'Tester',
  keyId: 'doc-1',
  label: 'Claude Code',
  scopes: ['vision:read']
};

const makeReq = (over: Partial<Request> = {}): Request =>
  ({
    method: 'GET',
    path: '/',
    headers: { authorization: `Bearer ${KEY}` },
    ...over
  }) as unknown as Request;

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

let next: NextFunction;

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn() as unknown as NextFunction;
  verify.mockResolvedValue(VALID);
});

describe('apiKeyAuth — passing through', () => {
  it('does nothing when a JWT middleware already authenticated the request', async () => {
    const req = makeReq({ user: { id: 'u9' } });

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(verify).not.toHaveBeenCalled();
    expect(req.user).toEqual({ id: 'u9' });
    expect(next).toHaveBeenCalled();
  });

  it.each([
    ['a JWT', 'Bearer header.payload.signature'],
    ["a vision-service project token", 'Bearer a1b2c3d4e5f6a1b2c3d4e5f6'],
    ['no header at all', undefined]
  ])('leaves %s to whichever middleware owns it', async (_label, authorization) => {
    const res = makeRes();

    await apiKeyAuth('vision')(
      makeReq({ headers: authorization ? { authorization } : {} }),
      res,
      next
    );

    expect(verify).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('ignores a key presented as a cookie', async () => {
    // A key is pasted into a config by a person and sent by software. Honouring
    // it as a cookie would make it usable in a cross-site request.
    const req = makeReq({ headers: {}, cookies: { access_token: KEY } } as Partial<Request>);

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(verify).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('apiKeyAuth — authenticating', () => {
  it('attaches the user and the key context for a valid read', async () => {
    const req = makeReq();

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(verify).toHaveBeenCalledWith(KEY);
    expect(req.user).toEqual({ id: 'u1', email: 'u1@example.com', name: 'Tester' });
    expect(req.apiKey).toEqual({
      keyId: 'doc-1',
      scopes: ['vision:read'],
      label: 'Claude Code',
      required: 'vision:read'
    });
    expect(next).toHaveBeenCalled();
  });

  it.each(['unknown', 'revoked', 'expired', 'bad-secret', 'malformed'])(
    'answers a %s key with one indistinguishable 401',
    async (rejection) => {
      verify.mockResolvedValue({ ok: false, rejection });
      const res = makeRes();

      await apiKeyAuth('vision')(makeReq(), res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid or expired credentials'
      });
      expect(next).not.toHaveBeenCalled();
    }
  );
});

describe('apiKeyAuth — scope gating', () => {
  it.each([
    ['GET', 'vision:read'],
    ['HEAD', 'vision:read'],
    ['OPTIONS', 'vision:read'],
    ['POST', 'vision:write'],
    ['PUT', 'vision:write'],
    ['PATCH', 'vision:write'],
    ['DELETE', 'vision:write']
  ])('derives %s → %s', async (method, required) => {
    verify.mockResolvedValue({ ...VALID, scopes: ['vision:read', 'vision:write'] });
    const req = makeReq({ method });

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(req.apiKey?.required).toBe(required);
    expect(next).toHaveBeenCalled();
  });

  it('gates on the domain the route group was mounted for', async () => {
    // vision-service answers for both `vision` and `dataset`; a key holding
    // only one of them must not reach the other's routes.
    const res = makeRes();

    await apiKeyAuth('dataset')(makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('refuses a write with a read-only key, and names the scope it wanted', async () => {
    const res = makeRes();

    await apiKeyAuth('vision')(makeReq({ method: 'DELETE' }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      // Named precisely: the fix is a new key, not a retry, and a caller told
      // only "forbidden" will retry.
      message: 'This credential does not carry the "vision:write" scope.'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a read-only key call a read-shaped POST named in readPaths', async () => {
    // POST /api/trainings/compare reads two runs and writes nothing.
    const req = makeReq({ method: 'POST', path: '/compare' });

    await apiKeyAuth('vision', { readPaths: [/\/compare$/] })(req, makeRes(), next);

    expect(req.apiKey?.required).toBe('vision:read');
    expect(next).toHaveBeenCalled();
  });

  it('still treats other POSTs in that group as writes', async () => {
    const res = makeRes();

    await apiKeyAuth('vision', { readPaths: [/\/compare$/] })(
      makeReq({ method: 'POST', path: '/' }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses a key that carries no scopes at all', async () => {
    verify.mockResolvedValue({ ...VALID, scopes: undefined });
    const res = makeRes();

    await apiKeyAuth('vision')(makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});


/**
 * The bug this suite exists to prevent recurring.
 *
 * mcp-service forwards an OAuth access token to vision-service verbatim. Read
 * as a session JWT it verifies — same secret — but names the user in `sub`,
 * not `id`, so `req.user.id` landed undefined and an assistant connected
 * through OAuth saw only public projects while its owner's private ones stayed
 * invisible. It also carried no scopes, so a read-only grant would have been
 * gated on nothing.
 */
describe('apiKeyAuth — OAuth access tokens', () => {
  const RESOURCE = 'https://mcp.visin.eu';

  const accessToken = (scopes: Parameters<typeof mintAccessToken>[0]['scopes'], resource = RESOURCE) =>
    mintAccessToken({
      userId: 'u1',
      email: 'a@b.com',
      name: 'A B',
      resource,
      issuer: 'https://auth-api.visin.eu',
      scopes,
      clientId: 'vsn-client-abc',
      clientName: 'Claude'
    }).accessToken;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.MCP_PUBLIC_URL = RESOURCE;
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    delete process.env.MCP_PUBLIC_URL;
  });

  it('names the user from `sub`, so owner-scoped queries are actually scoped', async () => {
    const req = makeReq({ headers: { authorization: `Bearer ${accessToken(['vision:read'])}` } });

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(req.user).toEqual({ id: 'u1', email: 'a@b.com', name: 'A B' });
    expect(next).toHaveBeenCalled();
  });

  it('applies the grant\'s scopes, so a read-only connection cannot write', async () => {
    const res = makeRes();
    const req = makeReq({
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken(['vision:read'])}` }
    });

    await apiKeyAuth('vision')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a write-scoped grant write', async () => {
    const req = makeReq({
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken(['vision:read', 'vision:write'])}` }
    });

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(req.apiKey?.required).toBe('vision:write');
    expect(next).toHaveBeenCalled();
  });

  it('records the client id, not the rotating jti', async () => {
    const req = makeReq({ headers: { authorization: `Bearer ${accessToken(['vision:read'])}` } });

    await apiKeyAuth('vision')(req, makeRes(), next);

    expect(req.apiKey?.keyId).toBe('vsn-client-abc');
    expect(req.apiKey?.label).toBe('Claude');
  });

  it('refuses a token minted for another resource', async () => {
    const res = makeRes();
    const req = makeReq({
      headers: { authorization: `Bearer ${accessToken(['vision:read'], 'https://mcp.example.com')}` }
    });

    await apiKeyAuth('vision')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('leaves an ordinary session JWT to the session middleware', async () => {
    const session = jwt.sign({ id: 'u9', email: 'x@y.com' }, 'test-secret');
    const res = makeRes();
    const req = makeReq({ headers: { authorization: `Bearer ${session}` } });

    await apiKeyAuth('vision')(req, res, next);

    expect(req.user).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('never touches the database for a JWT', async () => {
    await apiKeyAuth('vision')(
      makeReq({ headers: { authorization: `Bearer ${accessToken(['vision:read'])}` } }),
      makeRes(),
      next
    );

    expect(verify).not.toHaveBeenCalled();
  });
});
