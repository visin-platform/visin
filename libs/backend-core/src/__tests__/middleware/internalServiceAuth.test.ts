import type { Response, NextFunction } from 'express';
import type { InternalServiceRequest } from '../../middleware/internalServiceAuth';
import {
  requireInternalServiceToken,
  validateInternalServiceToken,
  allowUserOrInternalService
} from '../../middleware/internalServiceAuth';

const makeReq = (overrides: Partial<InternalServiceRequest> = {}): InternalServiceRequest =>
  ({ headers: {}, ...overrides } as unknown as InternalServiceRequest);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
};

const next = jest.fn() as unknown as NextFunction;

const TOKEN = 'internal-service-test-secret-token!!';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.INTERNAL_SERVICE_TOKEN = TOKEN;
});

afterAll(() => {
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe('requireInternalServiceToken', () => {
  it('returns 500 when INTERNAL_SERVICE_TOKEN is not configured', () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    const req = makeReq({ headers: { 'x-internal-token': TOKEN } });
    const res = makeRes();

    requireInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no token header is present', () => {
    const req = makeReq();
    const res = makeRes();

    requireInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token (timing-safe)', () => {
    const req = makeReq({ headers: { 'x-internal-token': 'wrong-token-same-length!!!!!' } });
    const res = makeRes();

    requireInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() for a valid token', () => {
    const req = makeReq({ headers: { 'x-internal-token': TOKEN } });
    const res = makeRes();

    requireInternalServiceToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('validateInternalServiceToken', () => {
  it('calls next() with no side effects when no x-internal-token header present', () => {
    const req = makeReq();
    const res = makeRes();

    validateInternalServiceToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.isInternalService).toBeUndefined();
  });

  it('returns 500 when INTERNAL_SERVICE_TOKEN is not configured', () => {
    delete process.env.INTERNAL_SERVICE_TOKEN;
    const req = makeReq({ headers: { 'x-internal-token': TOKEN } });
    const res = makeRes();

    validateInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an invalid token (timing-safe)', () => {
    const req = makeReq({ headers: { 'x-internal-token': 'wrong-token-same-length!!!!!' } });
    const res = makeRes();

    validateInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a token with wrong length', () => {
    const req = makeReq({ headers: { 'x-internal-token': TOKEN + 'extra' } });
    const res = makeRes();

    validateInternalServiceToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('marks request as internal and calls next() for a valid token', () => {
    const req = makeReq({ headers: { 'x-internal-token': TOKEN } });
    const res = makeRes();

    validateInternalServiceToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.isInternalService).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets serviceIdentifier from x-service-id header', () => {
    const req = makeReq({
      headers: { 'x-internal-token': TOKEN, 'x-service-id': 'vision-service' }
    });
    validateInternalServiceToken(req, makeRes(), next);

    expect(req.serviceIdentifier).toBe('vision-service');
  });
});

describe('allowUserOrInternalService', () => {
  it('allows an already-authenticated internal service request', () => {
    const req = makeReq({ isInternalService: true });
    const res = makeRes();

    allowUserOrInternalService(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when neither internal service nor user is authenticated', () => {
    const req = makeReq();
    const res = makeRes();

    allowUserOrInternalService(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a request with an authenticated user', () => {
    const req = makeReq({ user: { id: 'u1', email: 'a@b.com', name: 'A' } });
    const res = makeRes();

    allowUserOrInternalService(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
