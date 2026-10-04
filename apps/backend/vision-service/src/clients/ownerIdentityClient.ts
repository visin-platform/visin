import { fetchWithTimeout, logger } from '@visin/backend-core';

/**
 * Who owns something, as far as the owner agreed to show: only `id` when a person hid their profile,
 * and nothing at all for a group without a public page.
 */
export interface OwnerIdentity {
  id: string;
  handle?: string;
  name?: string;
  picture?: string;
}

const MAX_PER_CALL = 100;

/**
 * One batched question per hundred ids to a service's internal "public identity" endpoint. Best effort
 * by design: a list is worth showing without its owners' names, so an unreachable or confused peer
 * costs the names (and a warning), not the list. An unset address skips the call, so tests and a bare
 * checkout make no request; production asserts both addresses at startup.
 */
async function lookup(base: string | undefined, path: string, ids: string[]): Promise<Map<string, OwnerIdentity>> {
  const found = new Map<string, OwnerIdentity>();
  const address = base?.replace(/\/$/, '');
  if (ids.length === 0 || !address) return found;

  for (let start = 0; start < ids.length; start += MAX_PER_CALL) {
    try {
      const response = await fetchWithTimeout(`${address}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN ?? '',
          'x-service-id': 'vision-service'
        },
        body: JSON.stringify({ ids: ids.slice(start, start + MAX_PER_CALL) }),
        timeoutMs: 3000,
        serviceName: path.startsWith('/auth') ? 'auth-service' : 'group-service'
      });
      if (!response.ok) {
        logger.warn('Could not look up owners', { path, status: response.status });
        continue;
      }
      const body = (await response.json()) as { data?: OwnerIdentity[] };
      for (const owner of body.data ?? []) found.set(owner.id, owner);
    } catch (error) {
      logger.warn('Could not look up owners', { path, error: (error as Error).message });
    }
  }
  return found;
}

/**
 * The identities of everyone and every group in `owners`, by id (a person's id and a group's never
 * collide), asking each service once for its kind.
 */
export async function lookupOwnerIdentities(owners: { kind: 'user' | 'group'; id: string }[]): Promise<Map<string, OwnerIdentity>> {
  const ids = (kind: 'user' | 'group') => [...new Set(owners.filter((owner) => owner.kind === kind).map((owner) => owner.id))];
  const [people, groups] = await Promise.all([
    lookup(process.env.AUTH_SERVICE_URL, '/auth/internal/users/public', ids('user')),
    lookup(process.env.GROUP_SERVICE_URL, '/api/internal/groups/public', ids('group'))
  ]);
  return new Map([...people, ...groups]);
}
