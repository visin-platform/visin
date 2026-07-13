import { signToken, verifyToken } from '../../utils/hmac';

const SECRET = 'test-hmac-secret';

beforeAll(() => {
  process.env.FILE_SERVICE_HMAC_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.FILE_SERVICE_HMAC_SECRET;
});

describe('hmac', () => {
  describe('signToken', () => {
    it('throws when FILE_SERVICE_HMAC_SECRET is not configured', () => {
      delete process.env.FILE_SERVICE_HMAC_SECRET;

      expect(() => signToken('upload', 'file-123', Date.now())).toThrow(
        'FILE_SERVICE_HMAC_SECRET env var is required'
      );

      process.env.FILE_SERVICE_HMAC_SECRET = SECRET;
    });

    it('returns a hex string', () => {
      const token = signToken('upload', 'file-123', Date.now() + 60_000);
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces the same output for identical inputs', () => {
      const expiresMs = Date.now() + 60_000;
      const t1 = signToken('upload', 'file-123', expiresMs);
      const t2 = signToken('upload', 'file-123', expiresMs);
      expect(t1).toBe(t2);
    });

    it('produces different tokens for different operations', () => {
      const expiresMs = Date.now() + 60_000;
      const upload = signToken('upload', 'file-123', expiresMs);
      const download = signToken('download', 'file-123', expiresMs);
      expect(upload).not.toBe(download);
    });

    it('produces different tokens for different fileIds', () => {
      const expiresMs = Date.now() + 60_000;
      const a = signToken('upload', 'file-aaa', expiresMs);
      const b = signToken('upload', 'file-bbb', expiresMs);
      expect(a).not.toBe(b);
    });
  });

  describe('verifyToken', () => {
    it('returns true for a valid non-expired token', () => {
      const expiresMs = Date.now() + 60_000;
      const token = signToken('download', 'file-xyz', expiresMs);
      expect(verifyToken('download', 'file-xyz', expiresMs, token)).toBe(true);
    });

    it('returns false for an expired token', () => {
      const expiresMs = Date.now() - 1;
      const token = signToken('download', 'file-xyz', expiresMs);
      expect(verifyToken('download', 'file-xyz', expiresMs, token)).toBe(false);
    });

    it('returns false for a tampered token', () => {
      const expiresMs = Date.now() + 60_000;
      const token = signToken('upload', 'file-xyz', expiresMs);
      const tampered = token.slice(0, -2) + 'aa';
      expect(verifyToken('upload', 'file-xyz', expiresMs, tampered)).toBe(false);
    });

    it('returns false when operation does not match', () => {
      const expiresMs = Date.now() + 60_000;
      const token = signToken('upload', 'file-xyz', expiresMs);
      expect(verifyToken('download', 'file-xyz', expiresMs, token)).toBe(false);
    });
  });
});
