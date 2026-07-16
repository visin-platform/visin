import path from 'path';
import { toStem } from './manifest';

export type EntryClassification =
  | { type: 'frame'; path: string; stem: string }
  | { type: 'layer'; path: string; stem: string; set: string }
  | { type: 'idmap'; path: string; stem: string; set: string }
  | { type: 'masksJson'; path: string; stem: string; set: string }
  | { type: 'manifest'; path: string; format: 'csv' | 'jsonl' }
  | { type: 'ignored'; path: string }
  | { type: 'invalid'; path: string; reason: string };

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

// zips made with `cd bundle && zip -r ../bundle.zip .` vs `zip -r bundle.zip bundle/`
// differ by one leading dir — tolerate both by stripping a single common root.
const stripRoot = (entryPath: string): string => {
  const parts = entryPath.split('/');
  if (parts.length > 1 && !['frames', 'ann'].includes(parts[0]) && !parts[0].startsWith('manifest.')) {
    return parts.slice(1).join('/');
  }
  return entryPath;
};

const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

/**
 * Classify one zip entry against the bundle format:
 * frames/<name>, ann/<set>/<name>[.ids].png, ann/<set>/<name>.masks.json,
 * manifest.csv|jsonl. Everything else is invalid; OS junk is silently ignored.
 */
export const classifyEntry = (rawPath: string): EntryClassification => {
  const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/')).replace(/^\/+/, '');

  if (normalized.startsWith('..') || normalized.includes('/../') || path.posix.isAbsolute(rawPath)) {
    return { type: 'invalid', path: rawPath, reason: 'Path escapes the bundle (zip-slip)' };
  }
  if (OS_JUNK.test(normalized) || normalized.endsWith('/')) {
    return { type: 'ignored', path: normalized };
  }

  const relative = stripRoot(normalized);
  const parts = relative.split('/');
  const filename = parts[parts.length - 1];
  const extension = path.posix.extname(filename).toLowerCase();

  if (parts.length === 1 && /^manifest\.(csv|jsonl)$/.test(filename)) {
    return { type: 'manifest', path: relative, format: filename.endsWith('.csv') ? 'csv' : 'jsonl' };
  }

  if (parts[0] === 'frames' && parts.length === 2) {
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return { type: 'invalid', path: relative, reason: `Unsupported frame type ${extension || '(none)'}` };
    }
    return { type: 'frame', path: relative, stem: toStem(filename) };
  }

  if (parts[0] === 'ann' && parts.length === 3) {
    const set = parts[1];
    if (filename.endsWith('.masks.json')) {
      return { type: 'masksJson', path: relative, stem: toStem(filename), set };
    }
    if (filename.endsWith('.ids.png')) {
      return { type: 'idmap', path: relative, stem: toStem(filename), set };
    }
    if (extension === '.png') {
      return { type: 'layer', path: relative, stem: toStem(filename), set };
    }
    return { type: 'invalid', path: relative, reason: 'Annotation layers must be .png (or .ids.png / .masks.json)' };
  }

  return { type: 'invalid', path: relative, reason: 'Outside frames/, ann/<set>/, manifest.*' };
};
