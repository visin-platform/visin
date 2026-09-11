import type { Request, Response, NextFunction } from 'express';
import { HttpError } from '@visin/backend-core';
import { requireApiKey, requireSignedToken } from '../../middleware/auth';
import { signToken } from '../../utils/hmac';

const API_KEY = 'test-api-key';
const HMAC_SECRET = 'test-hmac-secret';

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ headers: {}, query: {}, params: {}, ...overrides } as unknown as Request);

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: jest.Mock; json: jest.Mock };
};

const statusOf = (fn: () => void): number => {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) return err.statusCode;
    throw err;
  }
  throw new Error('expected middleware to throw');
};

let next: jest.Mock;

beforeEach(() => {
  next = jest.fn();
  process.env.FILE_SERVICE_API_KEY = API_KEY;
  process.env.FILE_SERVICE_HMAC_SECRET = HMAC_SECRET;
});

afterAll(() => {
  delete process.env.FILE_SERVICE_API_KEY;
  delete process.env.FILE_SERVICE_HMAC_SECRET;
});

describe('requireApiKey', () => {
  it('rejects a missing key', () => {
    expect(
      statusOf(() => requireApiKey(makeReq(), makeRes(), next as unknown as NextFunction))
    ).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong key', () => {
    expect(
      statusOf(() =>
        requireApiKey(
          makeReq({ headers: { 'x-internal-api-key': 'wrong' } }),
          makeRes(),
          next as unknown as NextFunction
        )
      )
    ).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes with the correct key', () => {
    requireApiKey(
      makeReq({ headers: { 'x-internal-api-key': API_KEY } }),
      makeRes(),
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireSignedToken', () => {
  const fileId = 'group/album/file.jpg';
  const middleware = requireSignedToken('upload');

  const signedReq = (expiresMs: number, token?: string) =>
    makeReq({
      params: { fileId: fileId.split('/') },
      query: { token: token ?? signToken('upload', fileId, expiresMs, '00000000-0000-0000-0000-000000000000'), expires: String(expiresMs), reservation: '00000000-0000-0000-0000-000000000000' },
    });

  it('rejects when token or expires is missing', () => {
    expect(
      statusOf(() =>
        middleware(makeReq({ params: { fileId: ['a'] } }), makeRes(), next as unknown as NextFunction)
      )
    ).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric expires value', () => {
    expect(
      statusOf(() =>
        middleware(
          makeReq({ params: { fileId: ['a'] }, query: { token: 'x', expires: 'soon' } }),
          makeRes(),
          next as unknown as NextFunction
        )
      )
    ).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when verification itself fails (malformed token hex)', () => {
    const expiresMs = Date.now() + 60_000;

    expect(
      statusOf(() =>
        middleware(signedReq(expiresMs, 'not-hex-of-right-length'), makeRes(), next as unknown as NextFunction)
      )
    ).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const expiresMs = Date.now() - 1000;

    expect(
      statusOf(() => middleware(signedReq(expiresMs), makeRes(), next as unknown as NextFunction))
    ).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed for a different operation', () => {
    const expiresMs = Date.now() + 60_000;

    expect(
      statusOf(() =>
        middleware(
          signedReq(expiresMs, signToken('download', fileId, expiresMs)),
          makeRes(),
          next as unknown as NextFunction
        )
      )
    ).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a valid, unexpired token', () => {
    middleware(signedReq(Date.now() + 60_000), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
