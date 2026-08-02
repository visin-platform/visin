import crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

/**
 * scrypt from node:crypto rather than bcrypt/argon2: it is memory-hard, in the
 * standard library, and needs no native build step — which matters because the
 * services are built for arm64 as well as amd64.
 *
 * N=16384/r=8 costs ~16MB and a few tens of milliseconds per hash, comfortably
 * under node's 32MB default `maxmem`. The parameters are stored in the hash so
 * they can be raised later without invalidating existing passwords.
 */
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Long enough to resist guessing, capped so a huge body can't burn CPU. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/** `scrypt$N$r$p$salt$hash`, all numbers decimal and both blobs hex. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain, salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('hex'), derived.toString('hex')].join('$');
}

/**
 * Returns false for anything malformed rather than throwing: a corrupted or
 * legacy hash should read as "wrong password", not as a 500 that tells the
 * caller their account is special.
 */
export async function verifyPassword(plain: string, stored: string | undefined | null): Promise<boolean> {
  if (!stored) return false;

  const [scheme, n, r, p, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  const params = { N: Number(n), r: Number(r), p: Number(p) };
  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, 'hex');
    const derived = await scrypt(plain, Buffer.from(saltHex, 'hex'), expected.length, params);
    // Lengths already match by construction, but timingSafeEqual throws on a
    // mismatch, so guard it rather than let a bad record become a 500.
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
