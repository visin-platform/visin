import type { Request } from 'express';

jest.mock('../../clients/groupServiceClient', () => ({
  checkMembership: jest.fn(),
}));

import { assertMember, assertAdmin, requireUser } from '../../services/groupAccessService';
import { checkMembership } from '../../clients/groupServiceClient';
import { ForbiddenError, UnauthorizedError } from '@visin/backend-core';

const mockedCheck = checkMembership as jest.Mock;

const makeReq = (): Request => ({ user: { id: 'u1', email: 'User@X.com' } } as unknown as Request);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireUser', () => {
  it('returns the user when id and email are present', () => {
    expect(requireUser(makeReq()).id).toBe('u1');
  });

  it('rejects a request without a full user identity', () => {
    expect(() => requireUser({} as Request)).toThrow(UnauthorizedError);
    expect(() => requireUser({ user: { email: 'User@X.com' } } as unknown as Request)).toThrow(UnauthorizedError);
  });
});

describe('assertMember', () => {
  it('passes the immutable account ID', async () => {
    mockedCheck.mockResolvedValue({ member: true, role: 'member' });

    await assertMember(makeReq(), 'g1');

    expect(mockedCheck).toHaveBeenCalledWith('g1', 'u1');
  });

  it('rejects a non-member', async () => {
    mockedCheck.mockResolvedValue({ member: false, role: null });

    await expect(assertMember(makeReq(), 'g1')).rejects.toThrow(ForbiddenError);
  });
});

describe('assertAdmin', () => {
  it.each(['owner', 'admin'] as const)('passes for role %s', async (role) => {
    mockedCheck.mockResolvedValue({ member: true, role });

    await expect(assertAdmin(makeReq(), 'g1')).resolves.toBeUndefined();
  });

  it('rejects a plain member', async () => {
    mockedCheck.mockResolvedValue({ member: true, role: 'member' });

    await expect(assertAdmin(makeReq(), 'g1')).rejects.toThrow(ForbiddenError);
  });
});

describe('per-request cache', () => {
  it('reuses one membership lookup per (request, group)', async () => {
    mockedCheck.mockResolvedValue({ member: true, role: 'admin' });
    const req = makeReq();

    await assertMember(req, 'g1');
    await assertAdmin(req, 'g1');
    await assertMember(req, 'g2');

    expect(mockedCheck).toHaveBeenCalledTimes(2); // g1 cached, g2 fresh
  });

  it('does not share the cache across requests', async () => {
    mockedCheck.mockResolvedValue({ member: true, role: 'member' });

    await assertMember(makeReq(), 'g1');
    await assertMember(makeReq(), 'g1');

    expect(mockedCheck).toHaveBeenCalledTimes(2);
  });
});

it('does not require an email for membership', async () => {
  mockedCheck.mockResolvedValue({ member: true, role: 'member' });
  await assertMember({ user: { id: 'Id-Only' } } as Request, 'g1');
  expect(mockedCheck).toHaveBeenCalledWith('g1', 'Id-Only');
});
