import { fetchDatasetInfo, type HubSibling } from '../clients/hubClient';
import type { DatasetSource } from '../models/Dataset';

/** A commit never changes, so what the Hub said about it is good for a while; the cap bounds memory. */
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 200;
const MAX_FILES_SHOWN = 100;

export interface HubFolder {
  path: string;
  files: number;
  bytes: number;
}

export interface HubDatasetSummary {
  repo: string;
  revision: string;
  license?: string;
  prettyName?: string;
  tags: string[];
  taskCategories: string[];
  languages: string[];
  sizeCategories: string[];
  gated: boolean;
  fileCount: number;
  totalBytes: number;
  /** top-level folders, which is where a dataset's splits usually are */
  folders: HubFolder[];
  files: { path: string; size?: number }[];
  truncated: boolean;
}

const cache = new Map<string, { at: number; summary: HubDatasetSummary }>();

/** Test hook: forget what was read. */
export const clearHubCache = (): void => cache.clear();

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).filter((item): item is string => typeof item === 'string');

const first = (value: unknown): string | undefined => strings(value)[0];

export function summarize(source: DatasetSource, info: Awaited<ReturnType<typeof fetchDatasetInfo>>): HubDatasetSummary {
  const siblings: HubSibling[] = (info.siblings ?? []).filter(file => typeof file.rfilename === 'string');
  const folders = new Map<string, HubFolder>();
  for (const file of siblings) {
    const top = file.rfilename.includes('/') ? file.rfilename.split('/')[0] : '';
    if (!top) continue;
    const folder = folders.get(top) ?? { path: top, files: 0, bytes: 0 };
    folder.files += 1;
    folder.bytes += file.size ?? 0;
    folders.set(top, folder);
  }
  const card = info.cardData ?? {};
  return {
    repo: source.repo,
    revision: source.revision,
    license: first(card.license),
    prettyName: first(card.pretty_name),
    tags: strings(info.tags).filter(tag => !tag.includes(':')).slice(0, 20),
    taskCategories: strings(card.task_categories),
    languages: strings(card.language),
    sizeCategories: strings(card.size_categories),
    gated: Boolean(info.gated),
    fileCount: siblings.length,
    totalBytes: siblings.reduce((sum, file) => sum + (file.size ?? 0), 0),
    folders: [...folders.values()].sort((a, b) => b.bytes - a.bytes),
    files: siblings.slice(0, MAX_FILES_SHOWN).map(file => ({ path: file.rfilename, size: file.size })),
    truncated: siblings.length > MAX_FILES_SHOWN
  };
}

/**
 * The card, size and file list of a dataset's Hub repo, at its pinned commit.
 * Nothing is copied: this is read from the Hub's API, and only for public repos.
 */
export async function hubSummary(source: DatasetSource): Promise<HubDatasetSummary> {
  const key = `${source.repo}@${source.revision}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.summary;
  const summary = summarize(source, await fetchDatasetInfo(source.repo, source.revision));
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), summary });
  return summary;
}
