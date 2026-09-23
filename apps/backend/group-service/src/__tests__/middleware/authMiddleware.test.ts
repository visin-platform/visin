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

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock };
};
let next: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  next = jest.fn();
  process.env.INTERNAL_SERVICE_TOKEN = 'svc-token';
});

afterAll(() => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('authenticateToken (group-service)', () => {
  it('admits a valid x-internal-token as an internal service, without user auth', () => {
    const req = makeReq({ 'x-internal-token': 'svc-token' });

    authenticateToken(req, makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request & { isInternalService?: boolean }).isInternalService).toBe(true);
    expect(mockedCoreAuth).not.toHaveBeenCalled();
  });

  it('refuses a wrong x-internal-token here, not in whichever router follows', () => {
    const res = makeRes();

    authenticateToken(makeReq({ 'x-internal-token': 'guess' }), res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(next).not.toHaveBeenCalledWith();
    expect(mockedCoreAuth).not.toHaveBeenCalled();
  });

  it('delegates to the shared JWT middleware otherwise', () => {
    const req = makeReq();
    const res = makeRes();

    authenticateToken(req, res, next as unknown as NextFunction);

    expect(mockedCoreAuth).toHaveBeenCalledWith(req, res, next);
    expect(next).not.toHaveBeenCalledWith();
  });
});
