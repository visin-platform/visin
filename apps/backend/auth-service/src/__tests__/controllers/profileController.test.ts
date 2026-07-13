import type { Request, Response } from 'express';

jest.mock('../../models/User', () => ({
  User: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
}));

import { getProfile, updateProfile } from '../../controllers/profileController';
import { User } from '../../models/User';

const mockedUser = User as unknown as Record<string, jest.Mock>;

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
  isApproved: true,
};

const makeRes = () => {
  const res = { json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & Record<string, jest.Mock>;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ body: {}, ...overrides } as unknown as Request);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getProfile', () => {
  it('throws when not authenticated', async () => {
    await expect(getProfile(makeReq(), makeRes())).rejects.toThrow('Not authenticated');
  });

  it('throws when the user no longer exists', async () => {
    mockedUser.findById.mockResolvedValue(null);

    await expect(getProfile(makeReq({ user: jwtUser }), makeRes())).rejects.toThrow('User not found');
  });

  it('combines JWT and database fields in the response', async () => {
    mockedUser.findById.mockResolvedValue(dbUser);
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
      },
      approved: true,
    });
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
      { new: true }
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
      { new: true }
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
