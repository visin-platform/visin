import { requireEnv } from '../config/env';

/**
 * Where a service reaches file-service: `FILE_SERVICE_INTERNAL_URL` (the
 * container network) when set, else `FILE_SERVICE_URL`, else the host-side dev
 * port outside production. The two settings differ in production, where the
 * public address runs through a CDN that answered Range requests with the whole
 * file and would carry every multi-GB transfer out through the edge and back.
 * Links handed to browsers are built by file-service from its own public URL,
 * so they are unaffected.
 */
export const fileServiceUrl = (): string =>
  (
    process.env.FILE_SERVICE_INTERNAL_URL ||
    process.env.FILE_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('FILE_SERVICE_URL') : 'http://localhost:5002')
  ).replace(/\/$/, '');

/** The credential file-service's `/internal/*` routes take. */
export const fileServiceAuthHeaders = (): Record<string, string> => ({
  'x-internal-api-key': requireEnv('FILE_SERVICE_API_KEY')
});
