/**
 * A short memory for what the public views compute, so a README's badge or a popular leaderboard does not rank every
 * public project again on each request.
 *
 * It is dropped (`invalidatePublic`) by every change that can alter a public view: recording, correcting, trashing,
 * publishing, withdrawing, hiding or approving a result, and a suite or project changing who can see it. So in one
 * process a withdrawal is gone at once; the time limit only bounds how long another process (or a change made
 * outside the service) can be behind. The lifetime is fixed at 30 seconds.
 */

const CACHE_TTL_MS = 30_000;
const MAX_ENTRIES = 500;

interface Entry {
  value: Promise<unknown>;
  expiresAt: number;
}

const entries = new Map<string, Entry>();

/** Ordinary tests write fixtures directly; cache-specific tests exercise the production lifetime. */
const ttlMs = (): number => process.env.NODE_ENV === 'test' ? 0 : CACHE_TTL_MS;

/** Forget everything: the next request of each view is computed afresh. */
export function invalidatePublic(): void {
  entries.clear();
}

/**
 * The value of `compute` for `key`, from memory when it is recent. A refusal (not found) is not remembered, and nor is
 * anything while the cache is off.
 */
export async function cachedPublic<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const ttl = ttlMs();
  if (ttl === 0) return compute();
  const now = Date.now();
  const held = entries.get(key);
  if (held && held.expiresAt > now) return held.value as Promise<T>;
  const value = compute();
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value as string);
  entries.set(key, { value, expiresAt: now + ttl });
  try {
    return await value;
  } catch (error) {
    if (entries.get(key)?.value === value) entries.delete(key);
    throw error;
  }
}
