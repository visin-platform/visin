import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of a presented header value against a configured
 * shared secret. Compares byte lengths, not string lengths: a header holding a
 * Latin-1 character is as long as the secret in characters but longer in
 * bytes, and `timingSafeEqual` throws on unequal buffers rather than answering.
 */
export function sharedSecretMatches(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== 'string' || !expected) return false;
  const given = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
