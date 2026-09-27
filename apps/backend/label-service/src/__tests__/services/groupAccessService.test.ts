import type { Request } from 'express';
import { UnauthorizedError } from '@visin/backend-core';
import { requireUser } from '../../services/groupAccessService';

const makeReq = (): Request => ({ user: { id: 'u1', email: 'User@X.com' } } as unknown as Request);

describe('requireUser', () => {
  it('returns the user when id and email are present', () => {
    expect(requireUser(makeReq()).id).toBe('u1');
  });

  it('rejects a request without a full user identity', () => {
    expect(() => requireUser({} as Request)).toThrow(UnauthorizedError);
    expect(() => requireUser({ user: { email: 'User@X.com' } } as unknown as Request)).toThrow(UnauthorizedError);
  });
});
