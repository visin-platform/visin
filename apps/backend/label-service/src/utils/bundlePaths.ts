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

/** One zip folder assigned to an annotation set by an import mapping. */
export interface AnnotationFolderMapping {
  path: string;
  set: string;
}

/**
 * Explicit "this folder is that" wiring for a zip that doesn't follow the
 * default layout. Absent, `classifyEntry`'s defaults apply.
 */
export interface ImportMapping {
  frames: string; // folder holding the frames; '' means the zip root
  annotations?: AnnotationFolderMapping[];
  manifest?: string; // full path of the manifest file inside the zip
  idsSuffix?: string;
  masksSuffix?: string;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Canonical annotation folder name — what docs and suggested mappings use. */
export const ANNOTATION_DIR = 'annotations';
/** `ann/` is the older spelling and stays accepted so existing bundles still import. */
export const ANNOTATION_DIRS = new Set([ANNOTATION_DIR, 'ann']);
export const FRAMES_DIR = 'frames';
const TOP_LEVEL_DIRS = new Set([FRAMES_DIR, ...ANNOTATION_DIRS]);

export const DEFAULT_IDS_SUFFIX = '.ids.png';
export const DEFAULT_MASKS_SUFFIX = '.masks.json';

// zips made with `cd bundle && zip -r ../bundle.zip .` vs `zip -r bundle.zip bundle/`
// differ by one leading dir — tolerate both by stripping a single common root.
const stripRoot = (entryPath: string): string => {
  const parts = entryPath.split('/');
  if (parts.length > 1 && !TOP_LEVEL_DIRS.has(parts[0]) && !parts[0].startsWith('manifest.')) {
    return parts.slice(1).join('/');
  }
  return entryPath;
};

const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

/** Shared front half of both classifiers: sanitize the path, drop junk. */
const preClassify = (rawPath: string): { normalized: string } | { result: EntryClassification } => {
  const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/')).replace(/^\/+/, '');

  if (normalized.startsWith('..') || normalized.includes('/../') || path.posix.isAbsolute(rawPath)) {
    return { result: { type: 'invalid', path: rawPath, reason: 'Path escapes the bundle (zip-slip)' } };
  }
  if (OS_JUNK.test(normalized) || normalized.endsWith('/')) {
    return { result: { type: 'ignored', path: normalized } };
  }
  return { normalized };
};

const manifestEntry = (relative: string, filename: string): EntryClassification => {
  if (/\.csv$/i.test(filename)) {
    return { type: 'manifest', path: relative, format: 'csv' };
  }
  if (/\.jsonl$/i.test(filename)) {
    return { type: 'manifest', path: relative, format: 'jsonl' };
  }
  return { type: 'invalid', path: relative, reason: 'Manifest must be .csv or .jsonl' };
};

/** Classify a file sitting in an annotation folder, honouring custom suffixes. */
const classifyAnnotationFile = (
  relative: string,
  filename: string,
  set: string,
  idsSuffix: string,
  masksSuffix: string
): EntryClassification => {
  if (filename.endsWith(masksSuffix)) {
    return { type: 'masksJson', path: relative, stem: filename.slice(0, -masksSuffix.length), set };
  }
  if (filename.endsWith(idsSuffix)) {
    return { type: 'idmap', path: relative, stem: filename.slice(0, -idsSuffix.length), set };
  }
  if (path.posix.extname(filename).toLowerCase() === '.png') {
    return { type: 'layer', path: relative, stem: toStem(filename), set };
  }
  return {
    type: 'invalid',
    path: relative,
    reason: `Annotation layers must be .png (or ${idsSuffix} / ${masksSuffix})`
  };
};

/**
 * Classify one zip entry against the default bundle format:
 * frames/<name>, annotations/<set>/<name>[.ids].png,
 * annotations/<set>/<name>.masks.json, manifest.csv|jsonl (`ann/` is still
 * accepted for the annotation folder). Everything else is invalid; OS junk is
 * silently ignored.
 */
export const classifyEntry = (rawPath: string): EntryClassification => {
  const pre = preClassify(rawPath);
  if ('result' in pre) {
    return pre.result;
  }

  const relative = stripRoot(pre.normalized);
  const parts = relative.split('/');
  const filename = parts[parts.length - 1];
  const extension = path.posix.extname(filename).toLowerCase();

  if (parts.length === 1 && /^manifest\.(csv|jsonl)$/.test(filename)) {
    return manifestEntry(relative, filename);
  }

  if (parts[0] === FRAMES_DIR && parts.length === 2) {
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return { type: 'invalid', path: relative, reason: `Unsupported frame type ${extension || '(none)'}` };
    }
    return { type: 'frame', path: relative, stem: toStem(filename) };
  }

  if (ANNOTATION_DIRS.has(parts[0]) && parts.length === 3) {
    return classifyAnnotationFile(relative, filename, parts[1], DEFAULT_IDS_SUFFIX, DEFAULT_MASKS_SUFFIX);
  }

  return { type: 'invalid', path: relative, reason: `Outside ${FRAMES_DIR}/, ${ANNOTATION_DIR}/<set>/, manifest.*` };
};

/** `a/b` inside `a` → `b`; anything deeper or elsewhere → undefined. */
const directChild = (entryPath: string, folder: string): string | undefined => {
  if (folder === '') {
    return entryPath.includes('/') ? undefined : entryPath;
  }
  if (!entryPath.startsWith(`${folder}/`)) {
    return undefined;
  }
  const rest = entryPath.slice(folder.length + 1);
  return rest.includes('/') ? undefined : rest;
};

export const normalizeFolder = (folder: string): string =>
  folder.replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');

/**
 * Build a classifier for one import. Without a mapping this is `classifyEntry`
 * (the default layout); with one, folders are matched exactly as mapped — no
 * root stripping, since the mapping is written against the paths the zip
 * actually contains.
 */
export const createEntryClassifier = (mapping?: ImportMapping): ((rawPath: string) => EntryClassification) => {
  if (!mapping) {
    return classifyEntry;
  }

  const idsSuffix = mapping.idsSuffix || DEFAULT_IDS_SUFFIX;
  const masksSuffix = mapping.masksSuffix || DEFAULT_MASKS_SUFFIX;
  const framesFolder = normalizeFolder(mapping.frames);
  const manifestPath = mapping.manifest ? normalizeFolder(mapping.manifest) : undefined;
  // Longest first so a nested annotation folder wins over a frames folder above it.
  const annotationFolders = (mapping.annotations || [])
    .map((entry) => ({ path: normalizeFolder(entry.path), set: entry.set }))
    .sort((a, b) => b.path.length - a.path.length);

  return (rawPath: string): EntryClassification => {
    const pre = preClassify(rawPath);
    if ('result' in pre) {
      return pre.result;
    }

    const relative = pre.normalized;
    const filename = relative.slice(relative.lastIndexOf('/') + 1);

    if (manifestPath !== undefined && relative === manifestPath) {
      return manifestEntry(relative, filename);
    }

    for (const folder of annotationFolders) {
      if (directChild(relative, folder.path) !== undefined) {
        return classifyAnnotationFile(relative, filename, folder.set, idsSuffix, masksSuffix);
      }
    }

    if (directChild(relative, framesFolder) !== undefined) {
      const extension = path.posix.extname(filename).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) {
        return { type: 'invalid', path: relative, reason: `Unsupported frame type ${extension || '(none)'}` };
      }
      return { type: 'frame', path: relative, stem: toStem(filename) };
    }

    return { type: 'invalid', path: relative, reason: 'Not covered by the import mapping' };
  };
};
