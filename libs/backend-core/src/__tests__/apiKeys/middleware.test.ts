jest.mock('../../apiKeys/service', () => ({ verifyApiKey: jest.fn() }));

import type { NextFunction, Request, Response } from 'express';
import { apiKeyAuth } from '../../apiKeys/middleware';
import { verifyApiKey } from '../../apiKeys/service';
import type { ApiKeyVerification } from '../../apiKeys/types';

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
      message: 'This API key does not carry the "vision:write" scope.'
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
