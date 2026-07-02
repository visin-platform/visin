import type { Request, Response, NextFunction } from 'express';
import { requireInternalServiceToken } from '../../middleware/internalServiceAuth';

const makeReq = (headers: Record<string, string> = {}): Request =>
  ({ headers } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

const next = jest.fn() as unknown as NextFunction;

const TOKEN = 'test-internal-secret-token-32chars!!';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INTERNAL_SERVICE_TOKEN = TOKEN;
});

afterAll(() => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('requireInternalServiceToken', () => {
  it('returns 500 when INTERNAL_SERVICE_TOKEN env var is not set', () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    const res = makeRes();

    requireInternalServiceToken(makeReq({ 'x-internal-token': TOKEN }), res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when x-internal-token header is missing', () => {
    const res = makeRes();

    requireInternalServiceToken(makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Internal service token required' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a wrong token', () => {
    const res = makeRes();

    requireInternalServiceToken(makeReq({ 'x-internal-token': 'wrong-token' }), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid internal service token' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a token with the correct value but different length', () => {
    const res = makeRes();

    requireInternalServiceToken(
      makeReq({ 'x-internal-token': TOKEN + 'x' }),
      res,
      next
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for the correct token', () => {
    const res = makeRes();

    requireInternalServiceToken(makeReq({ 'x-internal-token': TOKEN }), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
