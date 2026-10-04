import { fetchWithTimeout, logger } from '@visin/backend-core';

/** Who owns something, as far as the owner agreed to show: only `id` when they hid their profile. */
export interface OwnerIdentity {
  id: string;
  handle?: string;
  name?: string;
  picture?: string;
}

const MAX_PER_CALL = 100;

/**
 * Names and avatars for the people who own what is being listed, from auth-service, in
 * one call per hundred owners.
 *
 * Best effort by design: a list of datasets is worth showing without its owners' names, so
 * an unreachable or confused auth-service costs the names (and a warning), not the list.
 * Outside production an unset `AUTH_SERVICE_URL` skips the call, so tests and a bare
 * checkout make no request; production asserts it at startup.
 */
export async function lookupOwners(ids: string[]): Promise<Map<string, OwnerIdentity>> {
  const found = new Map<string, OwnerIdentity>();
  const unique = [...new Set(ids)];
  const base = process.env.AUTH_SERVICE_URL?.replace(/\/$/, '');
  if (unique.length === 0 || !base) return found;

  for (let start = 0; start < unique.length; start += MAX_PER_CALL) {
    try {
      const response = await fetchWithTimeout(`${base}/auth/internal/users/public`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
          'x-service-id': 'dataset-service'
        },
        body: JSON.stringify({ ids: unique.slice(start, start + MAX_PER_CALL) }),
        timeoutMs: 3000,
        serviceName: 'auth-service'
      });
      if (!response.ok) {
        logger.warn('Could not look up owners', { status: response.status });
        continue;
      }
      const body = (await response.json()) as { data?: OwnerIdentity[] };
      for (const owner of body.data ?? []) found.set(owner.id, owner);
    } catch (error) {
      logger.warn('Could not look up owners', { error: (error as Error).message });
    }
  }
  return found;
}
