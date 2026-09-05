import {
  decryptSecret,
  displayPrefix,
  encryptSecret,
  generateKey,
  isEncryptionConfigured,
  looksLikeApiKey,
  parseKey,
  resetEncryptionKeyCache,
  secretMatches,
  sha256
} from '../../apiKeys/crypto';

const SECRET = 'a-test-encryption-secret';

beforeEach(() => {
  process.env.API_KEY_ENCRYPTION_SECRET = SECRET;
  resetEncryptionKeyCache();
});

afterAll(() => {
  delete process.env.API_KEY_ENCRYPTION_SECRET;
  resetEncryptionKeyCache();
});

describe('generateKey', () => {
  it('mints a vsn_live token whose parts line up with the stored id and hash', () => {
    const { token, id, hash } = generateKey();

    expect(token).toMatch(/^vsn_live_[0-9a-f]{12}_.+$/);
    expect(id).toHaveLength(12);

    const parsed = parseKey(token);
    expect(parsed?.id).toBe(id);
    expect(sha256(parsed!.secret)).toBe(hash);
  });

  it('never repeats a key', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateKey().token));
    expect(tokens.size).toBe(50);
  });
});

describe('parseKey', () => {
  it('splits a well-formed key into its public id and secret half', () => {
    const parsed = parseKey('vsn_live_0123456789ab_abcdefghijklmnopqrstuvwxyz');

    expect(parsed).toEqual({ id: '0123456789ab', secret: 'abcdefghijklmnopqrstuvwxyz' });
  });

  it('keeps a secret containing underscores intact', () => {
    // base64url includes '_', so roughly a third of real secrets contain one.
    // Splitting on '_' rather than matching positionally would mangle them.
    const secret = 'abc_def_ghi_jkl_mno_pqr';
    expect(parseKey(`vsn_live_0123456789ab_${secret}`)?.secret).toBe(secret);
  });

  it.each([
    ['a non-string', 42],
    ['an empty string', ''],
    ['the wrong prefix', 'tmb_live_0123456789ab_abcdefghijklmnopqrst'],
    ['a short id', 'vsn_live_0123_abcdefghijklmnopqrst'],
    ['a non-hex id', 'vsn_live_zzzzzzzzzzzz_abcdefghijklmnopqrst'],
    ['no secret at all', 'vsn_live_0123456789ab_'],
    ['a suspiciously short secret', 'vsn_live_0123456789ab_tooshort']
  ])('returns null for %s', (_label, token) => {
    expect(parseKey(token)).toBeNull();
  });
});

describe('looksLikeApiKey', () => {
  it('recognises our prefix', () => {
    expect(looksLikeApiKey('vsn_live_0123456789ab_secret')).toBe(true);
  });

  it.each([
    ['a JWT', 'header.payload.signature'],
    ["a vision-service project token", 'a1b2c3d4e5f6a1b2c3d4e5f6'],
    ['a non-string', undefined]
  ])('rejects %s', (_label, token) => {
    expect(looksLikeApiKey(token)).toBe(false);
  });
});

describe('secretMatches', () => {
  it('accepts the secret the digest was made from', () => {
    expect(secretMatches('the-secret', sha256('the-secret'))).toBe(true);
  });

  it('rejects a different secret of the same length', () => {
    expect(secretMatches('the-secret', sha256('the-secrey'))).toBe(false);
  });

  it('rejects a malformed digest instead of throwing', () => {
    // timingSafeEqual throws on a length mismatch, so the guard has to come
    // first — a truncated column value must be a failed auth, not a 500.
    expect(secretMatches('the-secret', 'deadbeef')).toBe(false);
  });
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a token', () => {
    const { token } = generateKey();
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it('uses a fresh IV each time, so the same token never enciphers alike', () => {
    const { token } = generateKey();
    expect(encryptSecret(token).ciphertext).not.toBe(encryptSecret(token).ciphertext);
  });

  it('refuses a tampered ciphertext rather than returning rubbish', () => {
    const sealed = encryptSecret('vsn_live_0123456789ab_secret');
    const flipped = Buffer.from(sealed.ciphertext, 'base64');
    flipped[0] ^= 0xff;

    expect(() =>
      decryptSecret({ ...sealed, ciphertext: flipped.toString('base64') })
    ).toThrow();
  });

  it('cannot decrypt what a different secret encrypted', () => {
    const sealed = encryptSecret('vsn_live_0123456789ab_secret');

    process.env.API_KEY_ENCRYPTION_SECRET = 'a-completely-different-secret';
    resetEncryptionKeyCache();

    expect(() => decryptSecret(sealed)).toThrow();
  });

  it('throws a named error when the encryption secret is not configured', () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    resetEncryptionKeyCache();

    expect(() => encryptSecret('anything')).toThrow(/API_KEY_ENCRYPTION_SECRET/);
  });

  it('derives the key once and reuses it', () => {
    // scrypt is deliberately slow; deriving per call would put it on the
    // request path for every key issued.
    const first = encryptSecret('one');
    delete process.env.API_KEY_ENCRYPTION_SECRET;

    expect(decryptSecret(first)).toBe('one');
  });
});

describe('isEncryptionConfigured', () => {
  it('is true when the secret is present', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('is false when it is not, so a service that only verifies keys can say so', () => {
    delete process.env.API_KEY_ENCRYPTION_SECRET;
    expect(isEncryptionConfigured()).toBe(false);
  });
});

describe('displayPrefix', () => {
  it('shows enough to tell two keys apart and not enough to use one', () => {
    expect(displayPrefix('0123456789ab')).toBe('vsn_live_0123456789ab');
  });
});
