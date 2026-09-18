import path from 'path';

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

export type NormalizedPath =
  | { ok: true; path: string }
  | { ok: false; reason: 'junk' | 'directory' }
  | { ok: false; reason: 'unsafe' };

/**
 * One zip entry name as a safe, forward-slashed relative path.
 *
 * Zip-slip (`../`, absolute names) is reported rather than silently stripped:
 * an archive that tries it is suspicious, and the import report should say so.
 */
export const normalizeEntryPath = (rawPath: string): NormalizedPath => {
  const slashed = rawPath.replace(/\\/g, '/');
  if (slashed.endsWith('/')) return { ok: false, reason: 'directory' };
  const normalized = path.posix.normalize(slashed).replace(/^\/+/, '');
  if (path.posix.isAbsolute(slashed) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return { ok: false, reason: 'unsafe' };
  }
  if (OS_JUNK.test(normalized)) return { ok: false, reason: 'junk' };
  return { ok: true, path: normalized };
};

/** `a/b/` or `./a/b` → `a/b`; the zip root is `''`. */
export const normalizeFolder = (folder: string): string =>
  folder.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');

export const extensionOf = (filePath: string): string => path.posix.extname(filePath).toLowerCase();

export const folderOf = (filePath: string): string => {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? '' : filePath.slice(0, slash);
};

// A second, word-like extension names a variant: `0001.ids.png`, `0001.masks.json`.
// Starting with a letter keeps dotted names like `frame.000012.png` or `img.2023.jpg`
// in the stem, where they belong.
const VARIANT = /^(.+)\.([A-Za-z][A-Za-z0-9_-]{0,31})$/;

/** `dir/0001.ids.png` → `{ stem: '0001', variant: 'ids' }`; `dir/0001.jpg` → `{ stem: '0001' }`. */
export const stemAndVariant = (filePath: string): { stem: string; variant?: string } => {
  const filename = filePath.slice(filePath.lastIndexOf('/') + 1);
  const extension = path.posix.extname(filename);
  const base = extension ? filename.slice(0, -extension.length) : filename;
  const match = VARIANT.exec(base);
  return match ? { stem: match[1], variant: match[2] } : { stem: base };
};

export const mimetypeFor = (filePath: string): string =>
  MIME_BY_EXTENSION[extensionOf(filePath)] || 'application/octet-stream';
