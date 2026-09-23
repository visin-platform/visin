import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

jest.mock('../../services/jwtService', () => ({
  verifyJWT: jest.fn(),
}));
jest.mock('../../models/Session', () => jest.requireActual('../helpers/sessionModelMock').sessionModule());
jest.mock('../../models/User', () => ({
  User: {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  },
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  authenticateToken,
  optionalAuth,
  requireRole,
} from '../../middleware/authMiddleware';
import { verifyJWT } from '../../services/jwtService';
import { User } from '../../models/User';
import { Session } from '../../models/Session';
import { makeSession } from '../helpers/sessionModelMock';

const mockedVerifyJWT = verifyJWT as jest.Mock;
const mockedUser = User as unknown as Record<string, jest.Mock>;

// A live session token; its session document is found unless a test says otherwise.
const iat = Math.floor(Date.now() / 1000);
const liveSid = '64b7f1f77bcf86cd79943bbb';
const decoded = {
  id: 'db-id-1', email: 'Test@Example.com', name: 'Test User', tokenVersion: 3,
  sid: liveSid, typ: 'session', iat, exp: iat + 90 * 86400
};
const mockedSession = Session as unknown as Record<string, jest.Mock>;
const dbUser = { email: 'test@example.com', tokenVersion: 3, roles: ['admin'] };

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ cookies: {}, headers: {}, ...overrides } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & Record<string, jest.Mock>;
};

let next: jest.Mock;

// No database in these unit tests: stand in for the connection's state, which
// the middleware checks before querying.
let connectionState = 1;
Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, get: () => connectionState });

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn();
  connectionState = 1;
  mockedSession.findOne.mockResolvedValue(makeSession({ _id: liveSid }));
});

describe('authenticateToken', () => {
  it('returns 401 when no token is present', async () => {
    const res = makeRes();

    await authenticateToken(makeReq(), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Access token required' }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('accepts the token from the access_token cookie', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOne.mockResolvedValue(dbUser);
    const req = makeReq({ cookies: { access_token: 'cookie-token' } });

    await authenticateToken(req, makeRes(), next as unknown as NextFunction);

    expect(mockedVerifyJWT).toHaveBeenCalledWith('cookie-token');
    expect(mockedUser.findOne).toHaveBeenCalledWith(
      { _id: 'db-id-1', email: 'test@example.com' }, undefined,
      { readPreference: 'primary', maxTimeMS: 3000 }
    );
    expect(req.user).toEqual(decoded);
    expect((req as unknown as { dbUser: unknown }).dbUser).toBe(dbUser);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls back to the Authorization header', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOne.mockResolvedValue(dbUser);
    const req = makeReq({ headers: { authorization: 'Bearer header-token' } });

    await authenticateToken(req, makeRes(), next as unknown as NextFunction);

    expect(mockedVerifyJWT).toHaveBeenCalledWith('header-token');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 when the user no longer exists', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOne.mockResolvedValue(null);
    const res = makeRes();

    await authenticateToken(
      makeReq({ cookies: { access_token: 't' } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'User not found' }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 401 when tokenVersion does not match', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, tokenVersion: 2 });
    mockedUser.findOne.mockResolvedValue(dbUser);
    const res = makeRes();

    await authenticateToken(
      makeReq({ cookies: { access_token: 't' } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Token has been invalidated' }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 401 when the token has no tokenVersion at all', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, tokenVersion: undefined });
    mockedUser.findOne.mockResolvedValue(dbUser);
    const res = makeRes();

    await authenticateToken(
      makeReq({ cookies: { access_token: 't' } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 401 when JWT verification throws', async () => {
    mockedVerifyJWT.mockImplementation(() => {
      throw new Error('Invalid or expired token');
    });
    const res = makeRes();

    await authenticateToken(
      makeReq({ cookies: { access_token: 'bad' } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid or expired token' }));
    expect(next).not.toHaveBeenCalledWith();
  });

  // A 401 from /auth/verify reads as "signed out" to every front; an outage must not.
  it('answers 503, without querying, while the database is disconnected', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    connectionState = 0;
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(mockedUser.findOne).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalledWith();
  });

  it('answers 503 when the account lookup fails', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOne.mockRejectedValue(new Error('connection reset'));
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 401, without querying, for a token of another type', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, typ: 'mcp_access' });
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mockedUser.findOne).not.toHaveBeenCalled();
  });

  it('accepts a token typed as a session', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, typ: 'session' });
    mockedUser.findOne.mockResolvedValue(dbUser);

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith();
  });

  it.each([
    ['an untyped token (signed before session tokens carried a type)', { typ: undefined }],
    ['a token naming no session', { sid: undefined }]
  ])('returns 401, without querying, for %s', async (_label, override) => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, ...override });
    mockedUser.findOne.mockResolvedValue(dbUser);

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('returns 401 for a token without an email claim', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, email: undefined });
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 'tok' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mockedUser.findOne).not.toHaveBeenCalled();
  });
});

describe('optionalAuth', () => {
  it('continues without a user when no token is present', async () => {
    const req = makeReq();

    await optionalAuth(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(mockedUser.findOneAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('attaches an existing user only when identity and token version match', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOneAndUpdate.mockResolvedValue(dbUser);
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toEqual(decoded);
    expect(mockedUser.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'db-id-1', email: 'test@example.com', tokenVersion: 3 },
      { $set: { lastLoginAt: expect.any(Date) } },
      { new: true, upsert: false }
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an untyped token', { typ: undefined }],
    ['a token of another type', { typ: 'mcp_access' }],
    ['a token with no user id', { id: '' }]
  ])('continues anonymously for %s, without looking anything up', async (_label, override) => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, ...override });
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(mockedSession.findOne).not.toHaveBeenCalled();
    expect(mockedUser.findOneAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('continues anonymously when the account no longer matches', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOneAndUpdate.mockResolvedValue(null);
    const req = makeReq({ headers: { authorization: 'Bearer t' } });

    await optionalAuth(req, makeRes(), next);

    expect(req.user).toBeUndefined();
    expect(req.dbUser).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not look up a token missing its version', async () => {
    mockedVerifyJWT.mockReturnValue({ ...decoded, tokenVersion: undefined });
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next);

    expect(mockedUser.findOneAndUpdate).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('swallows verification errors and continues anonymously', async () => {
    mockedVerifyJWT.mockImplementation(() => {
      throw new Error('bad token');
    });
    const req = makeReq({ cookies: { access_token: 'bad' } });

    await optionalAuth(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('session-bearing tokens', () => {
  const sid = '64b7f1f77bcf86cd79943aaa';
  const withSession = { ...decoded, sid, exp: iat + 90 * 86400 };

  it('attaches the live session and checks it belongs to the token user, unexpired, on the primary', async () => {
    const session = makeSession({ _id: sid });
    mockedVerifyJWT.mockReturnValue(withSession);
    mockedUser.findOne.mockResolvedValue(dbUser);
    mockedSession.findOne.mockResolvedValue(session);
    const req = makeReq({ cookies: { access_token: 't' } });

    await authenticateToken(req, makeRes(), next as unknown as NextFunction);

    expect(mockedSession.findOne).toHaveBeenCalledWith(
      { _id: sid, userId: 'db-id-1', expiresAt: { $gt: expect.any(Date) } },
      undefined,
      { readPreference: 'primary', maxTimeMS: 3000 }
    );
    expect(req.authSession).toBe(session);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('answers 503 when the session lookup fails', async () => {
    mockedVerifyJWT.mockReturnValue(withSession);
    mockedUser.findOne.mockResolvedValue(dbUser);
    mockedSession.findOne.mockRejectedValue(new Error('primary stepped down'));
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 't' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('refuses a token whose session was revoked or expired', async () => {
    mockedVerifyJWT.mockReturnValue(withSession);
    mockedUser.findOne.mockResolvedValue(dbUser);
    mockedSession.findOne.mockResolvedValue(null);
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 't' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Session has ended' }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it.each([
    ['a malformed sid', { ...withSession, sid: 'nope' }],
    ['no sid at all', { ...decoded, sid: undefined }]
  ])('refuses %s without looking a session up', async (_label, claims) => {
    mockedVerifyJWT.mockReturnValue(claims);
    mockedUser.findOne.mockResolvedValue(dbUser);
    const res = makeRes();

    await authenticateToken(makeReq({ cookies: { access_token: 't' } }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(mockedSession.findOne).not.toHaveBeenCalled();
  });

  it('optionalAuth attaches the live session', async () => {
    const session = makeSession({ _id: sid });
    mockedVerifyJWT.mockReturnValue(withSession);
    mockedSession.findOne.mockResolvedValue(session);
    mockedUser.findOneAndUpdate.mockResolvedValue(dbUser);
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next);

    expect(req.user).toEqual(withSession);
    expect(req.authSession).toBe(session);
  });

  it('optionalAuth continues anonymously on an ended session, without touching the account', async () => {
    mockedVerifyJWT.mockReturnValue(withSession);
    mockedSession.findOne.mockResolvedValue(null);
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next);

    expect(req.user).toBeUndefined();
    expect(mockedUser.findOneAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireRole', () => {
  it('rejects when there is no db user', () => {
    const res = makeRes();

    requireRole('admin')(makeReq(), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('rejects when the role is missing', () => {
    const res = makeRes();

    requireRole('admin')(
      makeReq({ dbUser: { ...dbUser, roles: ['user'] } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('rejects when the user has no roles array', () => {
    const res = makeRes();

    requireRole('admin')(
      makeReq({ dbUser: { ...dbUser, roles: undefined } }),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    expect(next).not.toHaveBeenCalledWith();
  });

  it('passes when the role is present', () => {
    requireRole('admin')(makeReq({ dbUser }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
