import type { Request, Response } from 'express';

jest.mock('../../services/googleAuthService', () => ({
  verifyGoogleToken: jest.fn(),
}));
jest.mock('../../services/googleSignInService', () => ({
  signInWithGoogle: jest.fn(),
}));
jest.mock('../../models/User', () => ({
  User: {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
  },
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  validateToken,
  logout,
  invalidateUserTokens,
  verifyAuth,
  refreshToken,
  listUsers,
} from '../../controllers/authController';
import { verifyGoogleToken } from '../../services/googleAuthService';
import { signInWithGoogle } from '../../services/googleSignInService';
import { verifyJWT } from '../../services/jwtService';
import { User } from '../../models/User';

const mockedVerifyGoogleToken = verifyGoogleToken as jest.Mock;
const mockedSignIn = signInWithGoogle as jest.Mock;
const mockedUser = User as unknown as Record<string, jest.Mock>;

type MockRes = Response & { json: jest.Mock; cookie: jest.Mock; clearCookie: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), cookie: jest.fn(), clearCookie: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, ...overrides } as unknown as Request);

const dbUser = {
  _id: { toString: () => 'db-id-1' },
  email: 'test@example.com',
  tokenVersion: 3,
};

const jwtUser = {
  id: 'db-id-1',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'pic.png',
  tokenVersion: 3,
};

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-long-enough-for-tests';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GROUP_SERVICE_URL;
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('validateToken', () => {
  const googlePayload = { sub: 'google-subject-1', email: 'Test@Example.com', name: 'Test User', picture: 'pic.png' };

  it('rejects when Google verification throws', async () => {
    mockedVerifyGoogleToken.mockRejectedValue(new Error('bad token'));

    await expect(validateToken(makeReq({ body: { idToken: 'x' } }), makeRes())).rejects.toThrow(
      'Invalid Google token'
    );
  });

  it('rejects when Google verification returns no payload', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(undefined);

    await expect(validateToken(makeReq({ body: { idToken: 'x' } }), makeRes())).rejects.toThrow(
      'Invalid Google token'
    );
  });

  it('rejects when the Google payload has no subject', async () => {
    mockedVerifyGoogleToken.mockResolvedValue({ name: 'No Email' });

    await expect(validateToken(makeReq({ body: { idToken: 'x' } }), makeRes())).rejects.toThrow(
      'Subject not present in Google token'
    );
  });

  it('propagates a refused sign-in without issuing a session', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(googlePayload);
    mockedSignIn.mockRejectedValue(new Error('An account with this email already exists'));
    const res = makeRes();

    await expect(validateToken(makeReq({ body: { idToken: 'x' } }), res)).rejects.toThrow('already exists');
    expect(mockedSignIn).toHaveBeenCalledWith(googlePayload);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('sets the access_token cookie and returns the user on success', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(googlePayload);
    mockedSignIn.mockResolvedValue(dbUser);
    mockedUser.updateOne.mockResolvedValue({});
    const res = makeRes();

    await validateToken(makeReq({ body: { idToken: 'x' } }), res);

    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: dbUser._id },
      { $set: { lastLoginAt: expect.any(Date) } }
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'access_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: '/' })
    );
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.user).toEqual(
      expect.objectContaining({ id: 'db-id-1', email: 'test@example.com', tokenVersion: 3 })
    );
    expect(verifyJWT(body.token).email).toBe('test@example.com');
  });

  it('defaults tokenVersion to 1 when the db user has none', async () => {
    mockedVerifyGoogleToken.mockResolvedValue(googlePayload);
    mockedSignIn.mockResolvedValue({ ...dbUser, tokenVersion: undefined });
    mockedUser.updateOne.mockResolvedValue({});
    const res = makeRes();

    await validateToken(makeReq({ body: { idToken: 'x' } }), res);

    expect(res.json.mock.calls[0][0].user.tokenVersion).toBe(1);
  });

  it('includes group roles from the group service in the JWT', async () => {
    process.env.GROUP_SERVICE_URL = 'http://group';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    mockedVerifyGoogleToken.mockResolvedValue(googlePayload);
    mockedSignIn.mockResolvedValue(dbUser);
    mockedUser.updateOne.mockResolvedValue({});
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: ['owner', 'member'] }),
    }) as unknown as typeof fetch;
    const res = makeRes();

    await validateToken(makeReq({ body: { idToken: 'x' } }), res);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('http://group/api/groups/mine/roles?userId='),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-internal-token': 'internal' }) })
    );
    const claims = verifyJWT(res.json.mock.calls[0][0].token);
    // Roles, not group ids: ids could never be matched against 'owner'/'admin'
    // by the fronts, and nothing else read them.
    expect(claims.groupRoles).toEqual(['owner', 'member']);
  });
});

describe('getUserGroupRoles edge cases (via verifyAuth)', () => {
  const reqWithUser = () => makeReq({ user: jwtUser });

  it('returns empty roles when the group service responds non-ok', async () => {
    process.env.GROUP_SERVICE_URL = 'http://group';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const res = makeRes();

    await verifyAuth(reqWithUser(), res);

    expect(res.json.mock.calls[0][0].user.groupRoles).toEqual([]);
  });

  it('returns empty roles when the group service reports failure', async () => {
    process.env.GROUP_SERVICE_URL = 'http://group';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    }) as unknown as typeof fetch;
    const res = makeRes();

    await verifyAuth(reqWithUser(), res);

    expect(res.json.mock.calls[0][0].user.groupRoles).toEqual([]);
  });

  it('returns empty roles when they are missing from a successful response', async () => {
    process.env.GROUP_SERVICE_URL = 'http://group';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as unknown as typeof fetch;
    const res = makeRes();

    await verifyAuth(reqWithUser(), res);

    expect(res.json.mock.calls[0][0].user.groupRoles).toEqual([]);
  });

  it('returns empty roles when fetch rejects', async () => {
    process.env.GROUP_SERVICE_URL = 'http://group';
    process.env.INTERNAL_SERVICE_TOKEN = 'internal';
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const res = makeRes();

    await verifyAuth(reqWithUser(), res);

    expect(res.json.mock.calls[0][0].user.groupRoles).toEqual([]);
  });

  it('skips the group service call when env vars are missing', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const res = makeRes();

    await verifyAuth(reqWithUser(), res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].user.groupRoles).toEqual([]);
  });
});

describe('logout', () => {
  it('clears the access_token cookie', () => {
    const res = makeRes();

    logout(makeReq(), res);

    expect(res.clearCookie).toHaveBeenCalledWith('access_token', expect.objectContaining({ path: '/' }));
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logged out successfully' });
  });
});

describe('invalidateUserTokens', () => {
  it('increments tokenVersion and reports the new value', async () => {
    mockedUser.findOneAndUpdate.mockResolvedValue({ ...dbUser, tokenVersion: 4 });
    const res = makeRes();

    await invalidateUserTokens(makeReq({ body: { email: 'Test@Example.com' } }), res);

    expect(mockedUser.findOneAndUpdate).toHaveBeenCalledWith(
      { email: 'test@example.com' },
      { $inc: { tokenVersion: 1 } },
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, newTokenVersion: 4 })
    );
  });

  it('throws NotFound for an unknown user', async () => {
    mockedUser.findOneAndUpdate.mockResolvedValue(null);

    await expect(
      invalidateUserTokens(makeReq({ body: { email: 'missing@example.com' } }), makeRes())
    ).rejects.toThrow('User not found');
  });
});

describe('verifyAuth', () => {
  it('throws when there is no authenticated user', async () => {
    await expect(verifyAuth(makeReq(), makeRes())).rejects.toThrow('No authenticated user');
  });

  it('re-issues the cookie with a fresh token', async () => {
    const res = makeRes();

    await verifyAuth(makeReq({ user: jwtUser }), res);

    expect(res.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.any(Object));
    const body = res.json.mock.calls[0][0];
    expect(body).toEqual(
      expect.objectContaining({ success: true, authenticated: true, token: expect.any(String) })
    );
    expect(verifyJWT(body.token).id).toBe('db-id-1');
  });

  it('defaults tokenVersion to 1 when missing from the JWT user', async () => {
    const res = makeRes();

    await verifyAuth(makeReq({ user: { ...jwtUser, tokenVersion: undefined } }), res);

    expect(res.json.mock.calls[0][0].user.tokenVersion).toBe(1);
  });
});

describe('refreshToken', () => {
  it('throws when there is no authenticated user', async () => {
    await expect(refreshToken(makeReq(), makeRes())).rejects.toThrow('No authenticated user');
  });

  it('sets a new cookie and returns token + group roles', async () => {
    const res = makeRes();

    await refreshToken(makeReq({ user: jwtUser }), res);

    expect(res.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, token: expect.any(String), groupRoles: [] })
    );
  });

  it('defaults tokenVersion to 1 when missing from the JWT user', async () => {
    const res = makeRes();

    await refreshToken(makeReq({ user: { ...jwtUser, tokenVersion: undefined } }), res);

    expect(verifyJWT(res.json.mock.calls[0][0].token).tokenVersion).toBe(1);
  });
});

describe('listUsers', () => {
  it('returns the latest users', async () => {
    const users = [dbUser];
    const limit = jest.fn().mockResolvedValue(users);
    const sort = jest.fn().mockReturnValue({ limit });
    mockedUser.find.mockReturnValue({ sort });
    const res = makeRes();

    await listUsers(makeReq(), res);

    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limit).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, users });
  });
});
