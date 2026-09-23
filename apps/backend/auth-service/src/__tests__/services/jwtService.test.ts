import { generateJWT as sign, verifyJWT, decodeJWT, UserPayload } from '../../services/jwtService';

const HOUR_MS = 60 * 60 * 1000;
const generateJWT = (user: UserPayload) => sign(user, new Date(Date.now() + HOUR_MS));

const SECRET = 'test-jwt-secret-long-enough-for-tests';
const payload = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  tokenVersion: 1,
};

beforeAll(() => {
  process.env.JWT_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

describe('jwtService', () => {
  describe('generateJWT + verifyJWT', () => {
    it('generates a token that can be verified', () => {
      const token = generateJWT(payload);
      const decoded = verifyJWT(token);

      expect(decoded.id).toBe(payload.id);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.name).toBe(payload.name);
      expect(decoded.tokenVersion).toBe(payload.tokenVersion);
    });

    it('marks the token as a session token', () => {
      expect(verifyJWT(generateJWT(payload)).typ).toBe('session');
    });

    it('expires when its session hits its hard cap', () => {
      const expiresAt = new Date(Date.now() + 90 * 24 * HOUR_MS);
      const decoded = verifyJWT(sign(payload, expiresAt)) as unknown as { exp: number };

      expect(Math.abs(decoded.exp - Math.floor(expiresAt.getTime() / 1000))).toBeLessThanOrEqual(1);
    });

    it('never signs an already-expired lifetime', () => {
      const decoded = decodeJWT(sign(payload, new Date(Date.now() - HOUR_MS))) as unknown as { iat: number; exp: number };

      expect(decoded.exp - decoded.iat).toBe(1);
    });

    it('throws for an invalid token', () => {
      expect(() => verifyJWT('not.a.valid.token')).toThrow(expect.objectContaining({ statusCode: 401, message: 'Invalid or expired token' }));
    });

    it('throws for a token signed with a different secret', () => {
      process.env.JWT_SECRET = 'different-secret';
      const badToken = generateJWT(payload);
      process.env.JWT_SECRET = SECRET;

      expect(() => verifyJWT(badToken)).toThrow('Invalid or expired token');
    });
  });

  describe('decodeJWT', () => {
    it('decodes a token without verifying signature', () => {
      const token = generateJWT(payload);
      const decoded = decodeJWT(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.email).toBe(payload.email);
    });

    it('returns null for a malformed token', () => {
      expect(decodeJWT('garbage')).toBeNull();
    });
  });
});
