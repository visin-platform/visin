import type { ImportMapping } from '../models/Dataset';
import { IMAGE_EXTENSIONS, extensionOf, normalizeEntryPath, normalizeFolder, stemAndVariant } from './zipPaths';

/** An entry import stores: an image (bytes to file-service) or a JSON sidecar (parsed into the item). */
export interface StoredEntry {
  type: 'image' | 'json';
  path: string;
  group: string;
  stem: string;
  variant?: string;
}

export type EntryClassification =
  | StoredEntry
  | { type: 'manifest'; path: string; format: 'csv' | 'jsonl' }
  /** outside every mapped folder, or a file type import doesn't store */
  | { type: 'skipped'; path: string }
  | { type: 'invalid'; path: string; reason: string };

const contains = (folder: string, entryPath: string): boolean =>
  folder === '' || entryPath.startsWith(`${folder}/`);

/**
 * What one zip entry becomes under a mapping.
 *
 * A mapped folder takes everything beneath it, and the deepest mapped folder
 * wins: mapping `annotations` → `labels` and `annotations/verify` → `verify`
 * sends `annotations/verify/1.png` to `verify` and every other annotation
 * folder to `labels`. Only images and JSON are stored; any other file type in a
 * mapped folder is skipped, not an error — it stays in the zip download.
 */
export const createClassifier = (mapping: ImportMapping): ((rawPath: string) => EntryClassification) => {
  const folders = mapping.groups
    .map((row) => ({ folder: normalizeFolder(row.folder), group: row.group }))
    .sort((a, b) => b.folder.length - a.folder.length);
  const manifestPath = mapping.manifest ? normalizeFolder(mapping.manifest) : undefined;

  return (rawPath) => {
    const normalized = normalizeEntryPath(rawPath);
    if (!normalized.ok) {
      return normalized.reason === 'unsafe'
        ? { type: 'invalid', path: rawPath, reason: 'Path escapes the archive (zip-slip)' }
        : { type: 'skipped', path: rawPath };
    }
    const entryPath = normalized.path;

    if (manifestPath !== undefined && entryPath === manifestPath) {
      if (/\.csv$/i.test(entryPath)) return { type: 'manifest', path: entryPath, format: 'csv' };
      if (/\.jsonl$/i.test(entryPath)) return { type: 'manifest', path: entryPath, format: 'jsonl' };
      return { type: 'invalid', path: entryPath, reason: 'Manifest must be .csv or .jsonl' };
    }

    const target = folders.find((row) => contains(row.folder, entryPath));
    if (!target) return { type: 'skipped', path: entryPath };

    const extension = extensionOf(entryPath);
    const type = IMAGE_EXTENSIONS.has(extension) ? 'image' : extension === '.json' ? 'json' : undefined;
    if (!type) return { type: 'skipped', path: entryPath };

    return { type, path: entryPath, group: target.group, ...stemAndVariant(entryPath) };
  };
};
