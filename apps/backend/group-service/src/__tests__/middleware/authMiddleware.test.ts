import type { Request, Response, NextFunction } from 'express';

jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  authenticateToken: jest.fn(),
}));

import { authenticateToken } from '../../middleware/authMiddleware';
import { authenticateToken as coreAuthenticateToken } from '@visin/backend-core';

const mockedCoreAuth = coreAuthenticateToken as jest.Mock;

const makeReq = (headers: Record<string, string> = {}): Request =>
  ({ headers } as unknown as Request);

const res = {} as Response;
let next: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn();
});

describe('authenticateToken (group-service)', () => {
  it('defers to internal-service validation when x-internal-token is present', () => {
    authenticateToken(makeReq({ 'x-internal-token': 'svc-token' }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockedCoreAuth).not.toHaveBeenCalled();
  });

  it('delegates to the shared JWT middleware otherwise', () => {
    const req = makeReq();

    authenticateToken(req, res, next as unknown as NextFunction);

    expect(mockedCoreAuth).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});
