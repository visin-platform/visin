import type { Request, Response, NextFunction } from 'express';
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
    const res = makeRes();

    requireApiKey(makeReq(), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a wrong key', () => {
    const res = makeRes();

    requireApiKey(
      makeReq({ headers: { 'x-internal-api-key': 'wrong' } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(401);
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
      query: { token: token ?? signToken('upload', fileId, expiresMs), expires: String(expiresMs) },
    });

  it('rejects when token or expires is missing', () => {
    const res = makeRes();

    middleware(makeReq({ params: { fileId: ['a'] } }), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric expires value', () => {
    const res = makeRes();

    middleware(
      makeReq({ params: { fileId: ['a'] }, query: { token: 'x', expires: 'soon' } }),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 500 when verification itself fails (malformed token hex)', () => {
    const res = makeRes();
    const expiresMs = Date.now() + 60_000;

    middleware(signedReq(expiresMs, 'not-hex-of-right-length'), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an expired token', () => {
    const res = makeRes();
    const expiresMs = Date.now() - 1000;

    middleware(signedReq(expiresMs), res, next as unknown as NextFunction);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a token signed for a different operation', () => {
    const res = makeRes();
    const expiresMs = Date.now() + 60_000;

    middleware(
      signedReq(expiresMs, signToken('download', fileId, expiresMs)),
      res,
      next as unknown as NextFunction
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes a valid, unexpired token', () => {
    middleware(signedReq(Date.now() + 60_000), makeRes(), next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
