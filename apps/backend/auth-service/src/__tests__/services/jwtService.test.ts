import { generateJWT, verifyJWT, decodeJWT } from '../../services/jwtService';

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

    it('throws for an invalid token', () => {
      expect(() => verifyJWT('not.a.valid.token')).toThrow('Invalid or expired token');
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
