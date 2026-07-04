import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { authenticateToken, optionalAuth } from '../../middleware/authMiddleware';
import type { UserPayload } from '../../types/auth';

const SECRET = 'test-secret';
const PAYLOAD: UserPayload = { id: 'u1', email: 'a@b.com', name: 'A' };

const makeReq = (authHeader?: string, cookies?: Record<string, string>): Request =>
  ({
    headers: authHeader ? { authorization: authHeader } : {},
    cookies: cookies ?? {}
  } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

const next = jest.fn() as unknown as NextFunction;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe('authenticateToken', () => {
  it('rejects with 401 when no Authorization header is present', () => {
    const req = makeReq();
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Access token required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 for a forged/unsigned token', () => {
    const forged = `${Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')}.${Buffer.from(
      JSON.stringify(PAYLOAD)
    ).toString('base64url')}.fake`;
    const req = makeReq(`Bearer ${forged}`);
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches req.user and calls next() for a validly signed token', () => {
    const token = jwt.sign(PAYLOAD, SECRET);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject(PAYLOAD);
  });

  it('skips re-verification when req.user is already set', () => {
    const req = makeReq();
    req.user = PAYLOAD;
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('accepts the shared access_token cookie when there is no Authorization header', () => {
    const token = jwt.sign(PAYLOAD, SECRET);
    const req = makeReq(undefined, { access_token: token });
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject(PAYLOAD);
  });

  it('prefers the access_token cookie over the Authorization header when both are present', () => {
    const cookieToken = jwt.sign({ ...PAYLOAD, id: 'from-cookie' }, SECRET);
    const headerToken = jwt.sign({ ...PAYLOAD, id: 'from-header' }, SECRET);
    const req = makeReq(`Bearer ${headerToken}`, { access_token: cookieToken });
    const res = makeRes();

    authenticateToken(req, res, next);

    expect((req.user as UserPayload).id).toBe('from-cookie');
  });

  it('falls back to the Authorization header (e.g. a vision-service API token) when no cookie is present', () => {
    const token = jwt.sign(PAYLOAD, SECRET);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject(PAYLOAD);
  });
});

describe('optionalAuth', () => {
  it('proceeds anonymously when no token is present', () => {
    const req = makeReq();
    const res = makeRes();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('proceeds anonymously (does not block) for a forged/invalid token', () => {
    const req = makeReq('Bearer not-a-real-token');
    const res = makeRes();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
  });

  it('attaches req.user for a validly signed token', () => {
    const token = jwt.sign(PAYLOAD, SECRET);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();

    optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toMatchObject(PAYLOAD);
  });
});
