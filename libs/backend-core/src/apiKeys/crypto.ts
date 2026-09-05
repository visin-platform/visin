import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from 'crypto';
import { requireEnv } from '../config/env';

/**
 * Key material, and the two different things done with it.
 *
 * A presented key is checked against a SHA-256 digest — fast, because it runs
 * on every request that arrives with one. Plain SHA-256 rather than bcrypt is
 * right here and wrong for a password: the secret is 32 bytes from a CSPRNG, so
 * there is no dictionary to attack and nothing a slow hash would buy.
 *
 * Separately the key is stored encrypted, so its owner can read it back later.
 * That is a deliberate trade — see `encryptSecret` — and it is why the digest is
 * kept as well: verification never touches the reversible copy.
 */

/** `vsn_live_<id>_<secret>` — the prefix makes a leaked key greppable in logs. */
const KEY_PREFIX = 'vsn_live';
const ID_BYTES = 6; // 12 hex chars, the public half
const SECRET_BYTES = 32;

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
/** Fixed: the input is a high-entropy env secret, not a password, so a per-record salt buys nothing. */
const KDF_SALT = 'visin/api-key/v1';

export interface GeneratedKey {
  /** the whole key, shown to the user once and never stored in this form */
  token: string;
  /** the public half, indexed for lookup */
  id: string;
  /** SHA-256 of the secret half, for verification */
  hash: string;
}

/** Derive the AES key once per process; scrypt is deliberately slow. */
let cachedKey: Buffer | null = null;
function encryptionKey(): Buffer {
  if (!cachedKey) {
    cachedKey = scryptSync(requireEnv('API_KEY_ENCRYPTION_SECRET'), KDF_SALT, 32);
  }
  return cachedKey;
}

/** Test seam: the derived key is cached for the life of the process. */
export const resetEncryptionKeyCache = (): void => {
  cachedKey = null;
};

/**
 * Whether keys can be issued and revealed at all.
 *
 * Only the reversible copy needs the secret — verification runs off the digest —
 * so a service that merely *accepts* keys works without it, and only the one
 * that issues them needs it configured. That asymmetry is easy to get wrong in
 * a deployment, so callers can ask rather than finding out through a 500 on
 * someone's first key.
 */
export const isEncryptionConfigured = (): boolean =>
  Boolean(process.env.API_KEY_ENCRYPTION_SECRET);

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const generateKey = (): GeneratedKey => {
  const id = randomBytes(ID_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('base64url');

  return {
    token: `${KEY_PREFIX}_${id}_${secret}`,
    id,
    hash: sha256(secret)
  };
};

export interface ParsedKey {
  id: string;
  secret: string;
}

/**
 * Split a presented key into its public id and its secret half.
 *
 * Returns null rather than throwing: an unparseable token is an ordinary failed
 * authentication, not an exceptional condition, and the caller answers both the
 * same way.
 *
 * Matched positionally rather than split on '_': the base64url alphabet
 * includes '_', so a secret can contain any number of them and splitting would
 * reject roughly a third of otherwise valid keys. The id is fixed-width, so
 * everything after it is the secret.
 */
export const parseKey = (token: unknown): ParsedKey | null => {
  if (typeof token !== 'string') return null;

  const match = token.match(/^vsn_live_([0-9a-f]{12})_(.+)$/);
  if (!match) return null;
  if (match[2].length < 16) return null;

  return { id: match[1], secret: match[2] };
};

/**
 * True when a token even looks like one of ours.
 *
 * Lets a caller skip a JWT parse — and, in vision-service, lets
 * `apiTokenMiddleware` skip a database lookup for a credential that is
 * definitively not one of its project tokens. Both of those credentials are
 * dot-free hex-ish strings, so without an explicit prefix test the only thing
 * telling them apart is which lookup happens to miss first.
 */
export const looksLikeApiKey = (token: unknown): boolean =>
  typeof token === 'string' && token.startsWith(`${KEY_PREFIX}_`);

/** Constant-time digest comparison, so a wrong key leaks nothing through timing. */
export const secretMatches = (secret: string, expectedHash: string): boolean => {
  const presented = Buffer.from(sha256(secret), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (presented.length !== expected.length) return false;
  return timingSafeEqual(presented, expected);
};

export interface SealedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Encrypt the key so it can be shown again later.
 *
 * Storing a recoverable copy is weaker than hashing alone: whoever holds both
 * the database and `API_KEY_ENCRYPTION_SECRET` can mint the plaintext. It buys
 * the ability to re-read a key you have lost, which the product wants. The
 * secret lives outside the database precisely so that a dump, a backup, or a
 * read-only replica is not on its own enough.
 */
export const encryptSecret = (token: string): SealedSecret => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
};

/**
 * Recover a stored key. Throws when the ciphertext has been tampered with —
 * GCM authenticates, so a modified record fails loudly instead of returning
 * plausible rubbish.
 */
export const decryptSecret = (sealed: SealedSecret): string => {
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(sealed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

/** What the UI shows in a list: enough to tell two keys apart, not enough to use one. */
export const displayPrefix = (id: string): string => `${KEY_PREFIX}_${id}`;
