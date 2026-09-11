import crypto from 'crypto';

const HMAC_SECRET = (): string => {
  const secret = process.env.FILE_SERVICE_HMAC_SECRET;
  if (!secret) throw new Error('FILE_SERVICE_HMAC_SECRET env var is required');
  return secret;
};

export type TokenOperation = 'upload' | 'download';

/**
 * Bind upload reservations without changing existing download capabilities.
 */
const buildMessage = (operation: TokenOperation, fileId: string, expiresMs: number, reservation = ''): string =>
  operation === 'upload' ? JSON.stringify([operation, fileId, expiresMs, reservation]) : `${operation}:${fileId}:${expiresMs}`;

/**
 * Sign a token for a given operation + fileId + expiry.
 */
export const signToken = (operation: TokenOperation, fileId: string, expiresMs: number, reservation = ''): string => {
  const message = buildMessage(operation, fileId, expiresMs, reservation);
  return crypto.createHmac('sha256', HMAC_SECRET()).update(message).digest('hex');
};

/**
 * Verify a token. Returns true if valid and not expired.
 */
export const verifyToken = (
  operation: TokenOperation,
  fileId: string,
  expiresMs: number,
  token: string,
  reservation = ''
): boolean => {
  if (Date.now() > expiresMs) return false;
  const expected = signToken(operation, fileId, expiresMs, reservation);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
};
