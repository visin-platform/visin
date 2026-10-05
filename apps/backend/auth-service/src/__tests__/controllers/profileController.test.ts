import type { Request, Response } from 'express';

jest.mock('../../models/Session', () => jest.requireActual('../helpers/sessionModelMock').sessionModule());
jest.mock('../../services/handleService', () => ({ ensureHandle: jest.fn() }));
jest.mock('../../models/User', () => ({
  User: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

import { getProfile, updateProfile, changePassword } from '../../controllers/profileController';
import { hashPassword, verifyPassword } from '../../services/passwordService';
import { verifyJWT } from '../../services/jwtService';
import { User } from '../../models/User';
import { ensureHandle } from '../../services/handleService';
import { makeSession } from '../helpers/sessionModelMock';

const mockedUser = User as unknown as Record<string, jest.Mock>;
const mockedEnsureHandle = ensureHandle as jest.Mock;

/** getProfile and changePassword both do findById(...).select('+passwordHash'). */
const findByIdReturns = (value: unknown) => {
  mockedUser.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(value) });
};

const jwtUser = {
  id: 'db-id-1',
  email: 'test@example.com',
  name: 'Test User',
  picture: 'pic.png',
};

const dbUser = {
  _id: { toString: () => 'db-id-1' },
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
};

type MockRes = Response & { json: jest.Mock; status: jest.Mock; cookie: jest.Mock };

const makeRes = (): MockRes => {
  const res = { json: jest.fn(), status: jest.fn(), cookie: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

// The live session authenticateToken attaches to every signed-in request.
const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, authSession: makeSession({ lastSeenAt: new Date() }), ...overrides } as unknown as Request);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getProfile', () => {
  it('throws when not authenticated', async () => {
    await expect(getProfile(makeReq(), makeRes())).rejects.toThrow('Not authenticated');
  });

  it('throws when the user no longer exists', async () => {
    findByIdReturns(null);

    await expect(getProfile(makeReq({ user: jwtUser }), makeRes())).rejects.toThrow('User not found');
  });

  it('combines JWT and database fields in the response', async () => {
    findByIdReturns(dbUser);
    const res = makeRes();

    await getProfile(makeReq({ user: jwtUser }), res);

    expect(mockedUser.findById).toHaveBeenCalledWith('db-id-1');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: {
        id: 'db-id-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        name: 'Test User',
        picture: 'pic.png',
        hasPassword: false,
        handle: undefined,
        bio: undefined,
        links: [],
        profilePublic: false,
        showActivity: true,
      },
    });
  });

  it('gives an account that predates handles its first one, and reports the public page it edits', async () => {
    const legacy = { ...dbUser, bio: 'Segmentation', links: ['https://example.test'], profilePublic: false } as typeof dbUser & { handle?: string };
    findByIdReturns(legacy);
    mockedEnsureHandle.mockImplementation(async (user: { handle?: string }) => {
      user.handle = 'test-user';
      return 'test-user';
    });
    const res = makeRes();

    await getProfile(makeReq({ user: jwtUser }), res);

    expect(mockedEnsureHandle).toHaveBeenCalledWith(legacy);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: expect.objectContaining({
        handle: 'test-user',
        bio: 'Segmentation',
        links: ['https://example.test'],
        profilePublic: false,
      }),
    });
  });

  it('reports that a password is set without ever returning the hash', async () => {
    findByIdReturns({ ...dbUser, passwordHash: 'scrypt$16384$8$1$aa$bb' });
    const res = makeRes();

    await getProfile(makeReq({ user: jwtUser }), res);

    const body = res.json.mock.calls[0][0];
    expect(body.user.hasPassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain('scrypt');
  });
});

describe('updateProfile', () => {
  it('throws when not authenticated', async () => {
    await expect(updateProfile(makeReq(), makeRes())).rejects.toThrow('Not authenticated');
  });

  it('throws when the user no longer exists', async () => {
    mockedUser.findByIdAndUpdate.mockResolvedValue(null);

    await expect(
      updateProfile(makeReq({ user: jwtUser, body: { firstName: 'New' } }), makeRes())
    ).rejects.toThrow('User not found');
  });

  it('updates trimmed names and returns the merged profile', async () => {
    mockedUser.findByIdAndUpdate.mockResolvedValue({ ...dbUser, firstName: 'New', lastName: 'Name' });
    const res = makeRes();

    await updateProfile(
      makeReq({ user: jwtUser, body: { firstName: '  New ', lastName: ' Name ' } }),
      res
    );

    expect(mockedUser.findByIdAndUpdate).toHaveBeenCalledWith(
      'db-id-1',
      { $set: { firstName: 'New', lastName: 'Name' } },
      { returnDocument: 'after' }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: expect.objectContaining({
        id: 'db-id-1',
        firstName: 'New',
        lastName: 'Name',
        name: 'Test User',
        picture: 'pic.png',
      }),
    });
  });

  it('nulls out fields set to empty strings and skips undefined ones', async () => {
    mockedUser.findByIdAndUpdate.mockResolvedValue(dbUser);
    const res = makeRes();

    await updateProfile(makeReq({ user: jwtUser, body: { firstName: '  ' } }), res);

    expect(mockedUser.findByIdAndUpdate).toHaveBeenCalledWith(
      'db-id-1',
      { $set: { firstName: null } },
      { returnDocument: 'after' }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('updateProfile public page', () => {
  it('sets the handle, bio, links and visibility, and reads an emptied bio as none', async () => {
    mockedUser.findByIdAndUpdate.mockResolvedValue({ ...dbUser, handle: 'ann', links: ['https://ann.example.test'] });
    const res = makeRes();

    await updateProfile(
      makeReq({
        user: jwtUser,
        body: { handle: 'ann', bio: '', links: ['https://ann.example.test'], profilePublic: false, showActivity: false },
      }),
      res
    );

    expect(mockedUser.findByIdAndUpdate).toHaveBeenCalledWith(
      'db-id-1',
      { $set: { handle: 'ann', bio: null, links: ['https://ann.example.test'], profilePublic: false, showActivity: false } },
      { returnDocument: 'after' }
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      user: expect.objectContaining({ handle: 'ann', links: ['https://ann.example.test'], profilePublic: false, showActivity: true }),
    });
  });

  it('keeps a bio as written', async () => {
    mockedUser.findByIdAndUpdate.mockResolvedValue(dbUser);

    await updateProfile(makeReq({ user: jwtUser, body: { bio: 'Road scenes' } }), makeRes());

    expect(mockedUser.findByIdAndUpdate).toHaveBeenCalledWith(
      'db-id-1',
      { $set: { bio: 'Road scenes' } },
      { returnDocument: 'after' }
    );
  });

  it('answers 409 when the handle is taken, however many asked at once', async () => {
    mockedUser.findByIdAndUpdate.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

    await expect(
      updateProfile(makeReq({ user: jwtUser, body: { handle: 'taken' } }), makeRes())
    ).rejects.toMatchObject({ statusCode: 409, message: 'That handle is taken' });
  });

  it('does not hide other database failures as a taken handle', async () => {
    mockedUser.findByIdAndUpdate.mockRejectedValue(new Error('connection lost'));

    await expect(updateProfile(makeReq({ user: jwtUser, body: { handle: 'ann' } }), makeRes())).rejects.toThrow(
      'connection lost'
    );
  });
});

describe('changePassword', () => {
  const res = () => makeRes();

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-long-enough-for-tests';
    delete process.env.GROUP_SERVICE_URL;
  });

  it('throws when not authenticated', async () => {
    await expect(changePassword(makeReq({ body: { newPassword: 'a-strong-password' } }), res())).rejects.toThrow(
      'Not authenticated'
    );
  });

  it('throws when the user no longer exists', async () => {
    findByIdReturns(null);

    await expect(
      changePassword(makeReq({ user: jwtUser, body: { newPassword: 'a-strong-password' } }), res())
    ).rejects.toThrow('User not found');
  });

  it('sets a first password without asking for a current one', async () => {
    // A Google-created account has no password; the session is the proof of
    // identity, so demanding a current password would make it unsettable.
    findByIdReturns({ ...dbUser, passwordHash: undefined });
    mockedUser.findByIdAndUpdate.mockResolvedValue({ ...dbUser, tokenVersion: 2 });
    const response = res();

    await changePassword(makeReq({ user: jwtUser, body: { newPassword: 'a-strong-password' } }), response);

    const update = mockedUser.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.passwordHash).toMatch(/^scrypt\$/);
    expect(update.$inc).toEqual({ tokenVersion: 1 });
    expect(response.json.mock.calls[0][0]).toMatchObject({ success: true, hasPassword: true, message: 'Password set' });
  });

  it('requires the current password once one exists', async () => {
    findByIdReturns({ ...dbUser, passwordHash: await hashPassword('the-old-password') });

    await expect(
      changePassword(makeReq({ user: jwtUser, body: { newPassword: 'a-new-password' } }), res())
    ).rejects.toThrow('current password is required');
    expect(mockedUser.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a wrong current password', async () => {
    findByIdReturns({ ...dbUser, passwordHash: await hashPassword('the-old-password') });

    await expect(
      changePassword(
        makeReq({ user: jwtUser, body: { currentPassword: 'not-it', newPassword: 'a-new-password' } }),
        res()
      )
    ).rejects.toThrow('Current password is incorrect');
    expect(mockedUser.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('changes the password when the current one matches, and stores a new hash', async () => {
    const oldHash = await hashPassword('the-old-password');
    findByIdReturns({ ...dbUser, passwordHash: oldHash });
    mockedUser.findByIdAndUpdate.mockResolvedValue({ ...dbUser, tokenVersion: 3 });
    const response = res();

    await changePassword(
      makeReq({ user: jwtUser, body: { currentPassword: 'the-old-password', newPassword: 'a-new-password' } }),
      response
    );

    const stored = mockedUser.findByIdAndUpdate.mock.calls[0][1].$set.passwordHash;
    expect(stored).not.toBe(oldHash);
    await expect(verifyPassword('a-new-password', stored)).resolves.toBe(true);
    await expect(verifyPassword('the-old-password', stored)).resolves.toBe(false);
    expect(response.json.mock.calls[0][0].message).toMatch(/Other sessions have been signed out/);
  });

  it('re-issues the cookie so the caller is not signed out by its own change', async () => {
    findByIdReturns({ ...dbUser, passwordHash: undefined });
    mockedUser.findByIdAndUpdate.mockResolvedValue({ ...dbUser, tokenVersion: 7 });
    const response = res();

    await changePassword(makeReq({ user: jwtUser, body: { newPassword: 'a-strong-password' } }), response);

    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      expect.any(String),
      expect.objectContaining({ httpOnly: true })
    );
    // Minted from the updated document, so it carries the bumped version.
    expect(verifyJWT(response.json.mock.calls[0][0].token).tokenVersion).toBe(7);
  });

  it('throws when the update finds nothing to update', async () => {
    findByIdReturns({ ...dbUser, passwordHash: undefined });
    mockedUser.findByIdAndUpdate.mockResolvedValue(null);

    await expect(
      changePassword(makeReq({ user: jwtUser, body: { newPassword: 'a-strong-password' } }), res())
    ).rejects.toThrow('User not found');
  });
});
