import type { Request, Response, NextFunction } from 'express';

jest.mock('../../services/jwtService', () => ({
  verifyJWT: jest.fn(),
}));
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
  requireApproved,
} from '../../middleware/authMiddleware';
import { verifyJWT } from '../../services/jwtService';
import { User } from '../../models/User';

const mockedVerifyJWT = verifyJWT as jest.Mock;
const mockedUser = User as unknown as Record<string, jest.Mock>;

const decoded = { id: 'db-id-1', email: 'Test@Example.com', name: 'Test User', tokenVersion: 3 };
const dbUser = { email: 'test@example.com', tokenVersion: 3, isApproved: true, roles: ['admin'] };

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ cookies: {}, headers: {}, ...overrides } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & Record<string, jest.Mock>;
};

let next: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn();
});

describe('authenticateToken', () => {
  it('returns 401 when no token is present', async () => {
    const res = makeRes();

    await authenticateToken(makeReq(), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Access token required' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts the token from the access_token cookie', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOne.mockResolvedValue(dbUser);
    const req = makeReq({ cookies: { access_token: 'cookie-token' } });

    await authenticateToken(req, makeRes(), next as unknown as NextFunction);

    expect(mockedVerifyJWT).toHaveBeenCalledWith('cookie-token');
    expect(mockedUser.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
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

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User not found' }));
    expect(next).not.toHaveBeenCalled();
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

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Token has been invalidated' })
    );
    expect(next).not.toHaveBeenCalled();
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

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
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

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or expired token' })
    );
    expect(next).not.toHaveBeenCalled();
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

  it('attaches the user and upserts on a valid token', async () => {
    mockedVerifyJWT.mockReturnValue(decoded);
    mockedUser.findOneAndUpdate.mockResolvedValue(dbUser);
    const req = makeReq({ cookies: { access_token: 't' } });

    await optionalAuth(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toEqual(decoded);
    expect(mockedUser.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'test@example.com' },
      expect.objectContaining({
        $setOnInsert: { email: 'test@example.com', signupMethod: 'google' },
      }),
      { new: true, upsert: true }
    );
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

describe('requireRole', () => {
  it('rejects when there is no db user', () => {
    const res = makeRes();

    requireRole('admin')(makeReq(), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the role is missing', () => {
    const res = makeRes();

    requireRole('admin')(
      makeReq({ dbUser: { ...dbUser, roles: ['user'] } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when the user has no roles array', () => {
    const res = makeRes();

    requireRole('admin')(
      makeReq({ dbUser: { ...dbUser, roles: undefined } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when the role is present', () => {
    requireRole('admin')(makeReq({ dbUser }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireApproved', () => {
  it('rejects with 401 when there is no db user', () => {
    const res = makeRes();

    requireApproved(makeReq(), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the user is not approved', () => {
    const res = makeRes();

    requireApproved(
      makeReq({ dbUser: { ...dbUser, isApproved: false } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'User not approved' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('passes for an approved user', () => {
    requireApproved(makeReq({ dbUser }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
