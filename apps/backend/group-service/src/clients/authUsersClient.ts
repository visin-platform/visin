import { BadGatewayError, fetchWithTimeout, HttpError, requireEnv } from '@visin/backend-core';

/** An account as auth-service's search answers it. */
export interface UserMatch {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

/**
 * auth-service's address: `AUTH_SERVICE_URL`, or the host-side dev port outside
 * production. In production there is no fallback, so a missing setting fails
 * loudly instead of calling whatever answers on this host.
 */
const authServiceUrl = (): string =>
  (
    process.env.AUTH_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? requireEnv('AUTH_SERVICE_URL') : 'http://localhost:5001')
  ).replace(/\/$/, '');

/**
 * Accounts whose email, first name or last name starts with `query`. Any
 * failure is auth-service's: a 502, or the 504 a timeout already is.
 */
export async function searchUsers(query: string, limit: number): Promise<UserMatch[]> {
  // Resolved before the call, so missing configuration says so instead of
  // passing for an unreachable peer.
  const url = `${authServiceUrl()}/auth/internal/users/search?q=${encodeURIComponent(query)}&limit=${limit}`;
  const headers = { 'x-internal-token': requireEnv('INTERNAL_SERVICE_TOKEN'), 'x-service-id': 'group-service' };
  let response: Awaited<ReturnType<typeof fetchWithTimeout>>;
  try {
    response = await fetchWithTimeout(url, { headers, timeoutMs: 5000, serviceName: 'auth-service' });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new BadGatewayError('Could not search accounts: auth-service is unreachable');
  }
  if (!response.ok) throw new BadGatewayError(`Could not search accounts: auth-service answered ${response.status}`);
  const body = (await response.json()) as { data?: UserMatch[] };
  if (!Array.isArray(body.data)) throw new BadGatewayError('Could not search accounts: auth-service answered with something unexpected');
  return body.data;
}
