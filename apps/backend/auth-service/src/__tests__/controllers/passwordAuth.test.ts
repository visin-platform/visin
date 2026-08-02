import type { Request, Response } from 'express';

jest.mock('../../models/User', () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn()
  }
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
}));

import { getSetupStatus, setupFirstUser, register, login } from '../../controllers/authController';
import { verifyJWT } from '../../services/jwtService';
import { hashPassword } from '../../services/passwordService';
import { User } from '../../models/User';

const mockedUser = User as unknown as Record<string, jest.Mock>;

type MockRes = Response & { json: jest.Mock; cookie: jest.Mock; status: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), cookie: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeReq = (body: Record<string, unknown> = {}): Request => ({ body }) as unknown as Request;

const dbUser = (overrides: Record<string, unknown> = {}) => ({
  _id: { toString: () => 'user-1' },
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  tokenVersion: 4,
  ...overrides
});

/** User.findOne(...).select('+passwordHash') */
const findOneReturns = (value: unknown) => {
  mockedUser.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
};

beforeAll(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-long-enough-for-tests';
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GROUP_SERVICE_URL;
  mockedUser.updateOne.mockResolvedValue({});
});

describe('getSetupStatus', () => {
  it('reports setup as needed while no user exists', async () => {
    mockedUser.countDocuments.mockResolvedValue(0);
    const res = makeRes();

    await getSetupStatus(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, needsSetup: true, googleEnabled: false });
  });

  it('reports setup as done once a user exists', async () => {
    mockedUser.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await getSetupStatus(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, needsSetup: false, googleEnabled: false });
  });

  it('reports Google as available only when a client id is configured', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    mockedUser.countDocuments.mockResolvedValue(1);
    const res = makeRes();

    await getSetupStatus(makeReq(), res);

    expect(res.json.mock.calls[0][0].googleEnabled).toBe(true);
  });
});

describe('setupFirstUser', () => {
  const body = { email: 'Owner@Example.com', password: 'a-strong-password', firstName: 'Ada', lastName: 'Lovelace' };

  it('creates an approved admin and signs them in', async () => {
    mockedUser.countDocuments.mockResolvedValue(0);
    mockedUser.create.mockImplementation(async (doc: Record<string, unknown>) => dbUser(doc));
    const res = makeRes();

    await setupFirstUser(makeReq(body), res);

    const created = mockedUser.create.mock.calls[0][0];
    expect(created.email).toBe('owner@example.com');
    expect(created.signupMethod).toBe('password');
    // Nobody exists who could promote this account, so setup must.
    expect(created.roles).toEqual(['admin']);
    expect(created.passwordHash).not.toBe(body.password);

    expect(res.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(verifyJWT(res.json.mock.calls[0][0].token).email).toBe('owner@example.com');
  });

  it('names the session from the supplied first and last name', async () => {
    mockedUser.countDocuments.mockResolvedValue(0);
    mockedUser.create.mockImplementation(async (doc: Record<string, unknown>) => dbUser(doc));
    const res = makeRes();

    await setupFirstUser(makeReq(body), res);

    expect(res.json.mock.calls[0][0].user.name).toBe('Ada Lovelace');
  });

  it('falls back to the email when no name is given', async () => {
    mockedUser.countDocuments.mockResolvedValue(0);
    mockedUser.create.mockImplementation(async (doc: Record<string, unknown>) =>
      dbUser({ ...doc, firstName: undefined, lastName: undefined })
    );
    const res = makeRes();

    await setupFirstUser(makeReq({ email: 'owner@example.com', password: 'a-strong-password' }), res);

    expect(res.json.mock.calls[0][0].user.name).toBe('owner@example.com');
  });

  it('closes permanently once any user exists', async () => {
    mockedUser.countDocuments.mockResolvedValue(1);

    await expect(setupFirstUser(makeReq(body), makeRes())).rejects.toThrow('Setup has already been completed');
    expect(mockedUser.create).not.toHaveBeenCalled();
  });
});

describe('register', () => {
  const body = { email: 'New@Example.com', password: 'a-strong-password' };

  it('creates an unprivileged account and signs it straight in', async () => {
    mockedUser.findOne.mockResolvedValue(null);
    mockedUser.create.mockImplementation(async (doc: Record<string, unknown>) => dbUser(doc));
    const res = makeRes();

    await register(makeReq(body), res);

    const created = mockedUser.create.mock.calls[0][0];
    expect(created.email).toBe('new@example.com');
    // No roles: access comes from group membership, not from a signup flag.
    expect(created.roles).toEqual([]);
    expect(created.passwordHash).not.toBe(body.password);

    expect(res.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.objectContaining({ httpOnly: true }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(verifyJWT(res.json.mock.calls[0][0].token).email).toBe('new@example.com');
  });

  it('rejects an email that already has an account', async () => {
    mockedUser.findOne.mockResolvedValue(dbUser());

    await expect(register(makeReq(body), makeRes())).rejects.toThrow('already exists');
    expect(mockedUser.create).not.toHaveBeenCalled();
  });
});

describe('login', () => {
  const password = 'a-strong-password';

  it('signs in a matching, approved account', async () => {
    findOneReturns(dbUser({ passwordHash: await hashPassword(password) }));
    const res = makeRes();

    await login(makeReq({ email: 'Ada@Example.com', password }), res);

    expect(mockedUser.findOne).toHaveBeenCalledWith({ email: 'ada@example.com' });
    expect(res.cookie).toHaveBeenCalledWith('access_token', expect.any(String), expect.objectContaining({ httpOnly: true }));

    const claims = verifyJWT(res.json.mock.calls[0][0].token);
    expect(claims.email).toBe('ada@example.com');
    expect(claims.tokenVersion).toBe(4);
    // The same shape Google sign-in produces, so downstream services can't tell
    // the strategies apart.
    expect(claims.groupRoles).toEqual([]);
  });

  it('stamps the last login', async () => {
    findOneReturns(dbUser({ passwordHash: await hashPassword(password) }));

    await login(makeReq({ email: 'ada@example.com', password }), makeRes());

    expect(mockedUser.updateOne).toHaveBeenCalledWith(
      { _id: expect.anything() },
      { $set: { lastLoginAt: expect.any(Date) } }
    );
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    findOneReturns(null);
    await expect(login(makeReq({ email: 'nobody@example.com', password }), makeRes())).rejects.toThrow(
      'Incorrect email or password'
    );

    findOneReturns(dbUser({ passwordHash: await hashPassword(password) }));
    await expect(login(makeReq({ email: 'ada@example.com', password: 'wrong-password' }), makeRes())).rejects.toThrow(
      'Incorrect email or password'
    );
  });

  it('refuses a Google-only account rather than erroring', async () => {
    // No passwordHash at all — must read as bad credentials, not a 500.
    findOneReturns(dbUser({ passwordHash: undefined }));

    await expect(login(makeReq({ email: 'ada@example.com', password }), makeRes())).rejects.toThrow(
      'Incorrect email or password'
    );
  });

  it('defaults tokenVersion to 1 when the record has none', async () => {
    findOneReturns(dbUser({ passwordHash: await hashPassword(password), tokenVersion: undefined }));
    const res = makeRes();

    await login(makeReq({ email: 'ada@example.com', password }), res);

    expect(verifyJWT(res.json.mock.calls[0][0].token).tokenVersion).toBe(1);
  });
});
