import { fetchWithTimeout, ServiceUnavailableError } from '@visin/backend-core';

export interface PublicProjectOption {
  id: string;
  name: string;
  slug?: string;
}

const SHOWN = 8;
/** How many of the newest public projects a partial name is looked for in. */
const SCANNED = 50;
const FRESH_MS = 60_000;
const MAX_CACHED = 200;
const MAX_BYTES = 512_000;

/** Public, the same for every visitor, and asked for on every pause in typing: kept for a minute. */
const cache = new Map<string, { at: number; projects: PublicProjectOption[] }>();

/** Test seam: forget what was cached. */
export function clearPublicCatalogue(): void {
  cache.clear();
}

/** One page of vision-service's public catalogue, asked with no credential, so only what Explore shows anyone. */
async function publicPage(params: Record<string, string>): Promise<PublicProjectOption[]> {
  const url = new URL('/api/public/projects', process.env.VISION_SERVICE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetchWithTimeout(url, { redirect: 'error', cache: 'no-store', serviceName: 'vision-service' });
  const text = response.ok ? await response.text() : '';
  if (!response.ok || text.length > MAX_BYTES) throw new ServiceUnavailableError('Public projects cannot be listed right now');
  let cards: unknown;
  try {
    cards = JSON.parse(text).data?.projects;
  } catch {
    throw new ServiceUnavailableError('Public projects cannot be listed right now');
  }
  return (Array.isArray(cards) ? cards : [])
    .filter((card): card is { id: string; name: string; slug?: unknown } => typeof card?.id === 'string' && typeof card?.name === 'string')
    .map((card) => ({
      id: card.id,
      name: card.name.slice(0, 200),
      ...(typeof card.slug === 'string' ? { slug: card.slug } : {})
    }));
}

async function cached(key: string, load: () => Promise<PublicProjectOption[]>): Promise<PublicProjectOption[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.projects;
  const projects = await load();
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(key, { at: Date.now(), projects });
  return projects;
}

/**
 * Public projects for a visitor to pick by name. Vision's search matches whole words, so "pub" would not find
 * "Public research"; names among the newest public projects that contain what was typed are added to its results.
 * A project made private since is still refused when a question is asked about it.
 */
export function searchPublicProjects(query: string): Promise<PublicProjectOption[]> {
  const q = query.trim().toLowerCase();
  if (!q) return cached('', () => publicPage({ limit: String(SHOWN) }));
  return cached(`q:${q}`, async () => {
    const [matched, recent] = await Promise.all([
      publicPage({ limit: String(SHOWN), search: q }),
      cached('', () => publicPage({ limit: String(SHOWN) })).then((first) =>
        first.length < SHOWN ? first : cached('recent', () => publicPage({ limit: String(SCANNED) }))
      )
    ]);
    const found = [...matched];
    for (const project of recent)
      if (project.name.toLowerCase().includes(q) && !found.some((existing) => existing.id === project.id)) found.push(project);
    return found.slice(0, SHOWN);
  });
}
