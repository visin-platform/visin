import { fetchWithTimeout, requireEnv } from '@visin/backend-core';

/**
 * The HTTP layer every domain client here shares.
 *
 * One decision is worth stating plainly, because it is the reason this service
 * can be trusted with a read-only credential: the caller's own key is forwarded
 * verbatim rather than exchanged for an internal service token. That keeps
 * every request scoped to exactly what the user granted — vision-service
 * resolves `req.user.id` from the key and applies `checkProjectAccess` as it
 * always has — so a `vision:read` key cannot be widened by passing through this
 * hop. Swapping it for `X-Internal-Token` would make this service a hole
 * straight through the project-privacy rules.
 */

/** An API error the model can act on, rather than a stack trace. */
export class VisinError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'VisinError';
  }
}

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * One service's base URL, preferring the in-network address.
 *
 * `*_INTERNAL_URL` is the container-network hostname, so a tool call never
 * leaves the host; `*_SERVICE_URL` is the public address and the fallback for a
 * deployment where the two are not on one network.
 */
export const serviceUrl = (name: string): string =>
  (process.env[`${name}_INTERNAL_URL`] || requireEnv(`${name}_SERVICE_URL`)).replace(/\/$/, '');

export type Query = Record<string, string | number | boolean | undefined>;

/**
 * One call against a Visin service, carrying the caller's credential.
 *
 * Goes through `fetchWithTimeout` rather than bare `fetch`, as every outbound
 * inter-service call in this repo does: undici leaves a stalled peer hanging
 * the caller for minutes, which is long enough for one degraded dependency to
 * exhaust this service's own capacity.
 */
export async function callService<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
  query?: Query
): Promise<T> {
  const url = new URL(`${baseUrl}/api${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetchWithTimeout(url, {
    method,
    serviceName: baseUrl,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  let parsed: Envelope<T> | undefined;
  try {
    parsed = text ? (JSON.parse(text) as Envelope<T>) : undefined;
  } catch {
    // A non-JSON body means something in front of the service answered — a
    // proxy, a gateway. The status is the only trustworthy part.
  }

  if (!response.ok) {
    throw new VisinError(
      parsed?.message || `Request failed with status ${response.status}`,
      response.status
    );
  }

  // Every Visin controller answers `{ success, data }`; the fallback covers a
  // route that answers with the payload directly.
  return (parsed?.data ?? parsed) as T;
}
