import crypto from 'crypto';
import type { Response, NextFunction } from 'express';

jest.mock('../../models/ApiToken', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), updateOne: jest.fn() },
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { apiTokenMiddleware } from '../../middleware/apiTokenMiddleware';
import type { AuthRequest } from '../../middleware/authMiddleware';
import ApiToken from '../../models/ApiToken';

const mockedApiToken = ApiToken as unknown as Record<string, jest.Mock>;

const RAW_TOKEN = 'abcdef0123456789';
const TOKEN_HASH = crypto.createHash('sha256').update(RAW_TOKEN).digest('hex');

const makeReq = (overrides: Record<string, unknown> = {}): AuthRequest =>
  ({ headers: {}, ...overrides } as unknown as AuthRequest);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const activeToken = (overrides: Record<string, unknown> = {}) => ({
  _id: 'tok-1',
  createdBy: 'user-1',
  projectId: { toString: () => 'proj-1' },
  isActive: true,
  lastUsedAt: undefined,
  ...overrides,
});

let next: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn();
  mockedApiToken.updateOne.mockReturnValue({ catch: jest.fn() });
});

describe('apiTokenMiddleware', () => {
  it('skips entirely when a user is already authenticated', async () => {
    await apiTokenMiddleware(makeReq({ user: { id: 'u1' } }), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockedApiToken.findOne).not.toHaveBeenCalled();
  });

  it('passes through without auth header', async () => {
    const req = makeReq();

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeUndefined();
    expect(mockedApiToken.findOne).not.toHaveBeenCalled();
  });

  it('ignores JWT-shaped tokens (contains dots)', async () => {
    await apiTokenMiddleware(
      makeReq({ headers: { authorization: 'Bearer aaa.bbb.ccc' } }),
      makeRes(),
      next as unknown as NextFunction
    );

    expect(mockedApiToken.findOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('ignores a user API key, which is dot-free but not one of these', async () => {
    // `vsn_live_…` keys (backend-core's apiKeyAuth) contain no dot either, so
    // the dots heuristic alone would send one here to be hashed and looked up:
    // a guaranteed miss, and a wasted indexed query on every assistant request.
    const req = makeReq({
      headers: { authorization: 'Bearer vsn_live_0123456789ab_a-secret-value-long-enough' },
    });

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(mockedApiToken.findOne).not.toHaveBeenCalled();
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('looks up the sha256 hash and attaches user + project scope', async () => {
    const token = activeToken();
    mockedApiToken.findOne.mockResolvedValue(token);
    const req = makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } });

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(mockedApiToken.findOne).toHaveBeenCalledWith({ tokenHash: TOKEN_HASH, isActive: true });
    expect(req.user).toEqual({ id: 'user-1' });
    expect(req.projectId).toBe('proj-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects expired tokens with 401', async () => {
    mockedApiToken.findOne.mockResolvedValue(activeToken({ expiresAt: new Date(Date.now() - 1000) }));
    const res = makeRes();

    await apiTokenMiddleware(
      makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Token expired' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts a token with a future expiry', async () => {
    mockedApiToken.findOne.mockResolvedValue(activeToken({ expiresAt: new Date(Date.now() + 60_000) }));
    const req = makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } });

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(req.projectId).toBe('proj-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refreshes lastUsedAt only when stale', async () => {
    mockedApiToken.findOne.mockResolvedValue(activeToken({ lastUsedAt: new Date(Date.now() - 120_000) }));

    await apiTokenMiddleware(
      makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } }),
      makeRes(),
      next as unknown as NextFunction
    );

    expect(mockedApiToken.updateOne).toHaveBeenCalledWith({ _id: 'tok-1' }, { lastUsedAt: expect.any(Date) });
  });

  it('skips the lastUsedAt write when it is fresh', async () => {
    mockedApiToken.findOne.mockResolvedValue(activeToken({ lastUsedAt: new Date() }));

    await apiTokenMiddleware(
      makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } }),
      makeRes(),
      next as unknown as NextFunction
    );

    expect(mockedApiToken.updateOne).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls through anonymously for an unknown token', async () => {
    mockedApiToken.findOne.mockResolvedValue(null);
    const req = makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } });

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('falls through anonymously when the lookup throws', async () => {
    mockedApiToken.findOne.mockRejectedValue(new Error('db down'));
    const req = makeReq({ headers: { authorization: `Bearer ${RAW_TOKEN}` } });

    await apiTokenMiddleware(req, makeRes(), next as unknown as NextFunction);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
