import path from 'path';
import { PassThrough } from 'stream';
import unzipper from 'unzipper';
import {
  ANNOTATION_DIRS,
  DEFAULT_IDS_SUFFIX,
  DEFAULT_MASKS_SUFFIX,
  FRAMES_DIR,
  ImportMapping
} from '../utils/bundlePaths';
import * as files from '../clients/fileServiceClient';

const MAX_ENTRIES = Number(process.env.INGEST_MAX_ENTRIES || 100_000);
const MAX_FOLDERS = 200;
const SAMPLES_PER_FOLDER = 3;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const OS_JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/;

/** What one folder of the uploaded zip contains, as shown in the mapping table. */
export interface ZipFolderSummary {
  path: string; // '' for the zip root
  files: number;
  images: number;
  idMaps: number;
  maskFiles: number;
  others: number;
  samples: string[];
}

export interface ZipPreview {
  entries: number;
  truncated: boolean; // more folders than MAX_FOLDERS — the tail is not listed
  folders: ZipFolderSummary[];
  manifestCandidates: string[];
  suggestion: ImportMapping;
}

interface ZipDirectoryEntry {
  path: string;
  type: 'File' | 'Directory';
}

const emptyFolder = (folderPath: string): ZipFolderSummary => ({
  path: folderPath,
  files: 0,
  images: 0,
  idMaps: 0,
  maskFiles: 0,
  others: 0,
  samples: []
});

const tally = (folders: Map<string, ZipFolderSummary>, entryPath: string): void => {
  const slash = entryPath.lastIndexOf('/');
  const folderPath = slash === -1 ? '' : entryPath.slice(0, slash);
  const filename = entryPath.slice(slash + 1);

  let folder = folders.get(folderPath);
  if (!folder) {
    if (folders.size >= MAX_FOLDERS) {
      return;
    }
    folder = emptyFolder(folderPath);
    folders.set(folderPath, folder);
  }

  folder.files += 1;
  if (folder.samples.length < SAMPLES_PER_FOLDER) {
    folder.samples.push(filename);
  }

  if (filename.endsWith(DEFAULT_MASKS_SUFFIX) || path.posix.extname(filename).toLowerCase() === '.json') {
    folder.maskFiles += 1;
  } else if (filename.endsWith(DEFAULT_IDS_SUFFIX)) {
    folder.idMaps += 1;
  } else if (IMAGE_EXTENSIONS.has(path.posix.extname(filename).toLowerCase())) {
    folder.images += 1;
  } else {
    folder.others += 1;
  }
};

const basename = (folderPath: string): string => folderPath.slice(folderPath.lastIndexOf('/') + 1);

const parentName = (folderPath: string): string => {
  const slash = folderPath.lastIndexOf('/');
  return slash === -1 ? '' : basename(folderPath.slice(0, slash));
};

const looksLikeAnnotations = (folder: ZipFolderSummary): boolean =>
  folder.idMaps > 0 ||
  folder.maskFiles > 0 ||
  ANNOTATION_DIRS.has(basename(folder.path)) ||
  ANNOTATION_DIRS.has(parentName(folder.path));

/**
 * Best guess at how the zip maps onto the bundle format, used to pre-fill the
 * mapping table: the conventional layout resolves to itself, anything else
 * falls back to "most images wins" for frames and treats id-map/mask-bearing
 * or leftover image folders as annotation sets.
 */
export const suggestMapping = (folders: ZipFolderSummary[], manifestCandidates: string[]): ImportMapping => {
  const withImages = folders.filter((folder) => folder.images > 0 || folder.idMaps > 0);

  const named = withImages.find((folder) => basename(folder.path) === FRAMES_DIR);
  const frames =
    named ||
    withImages
      .filter((folder) => !looksLikeAnnotations(folder))
      .sort((a, b) => b.images - a.images)[0] ||
    withImages.sort((a, b) => b.images - a.images)[0];

  const annotations = folders
    .filter((folder) => folder !== frames && folder.path !== '' && (folder.images > 0 || folder.idMaps > 0 || folder.maskFiles > 0))
    .map((folder) => ({ path: folder.path, set: basename(folder.path) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const manifest =
    manifestCandidates.find((candidate) => /^manifest\.(csv|jsonl)$/i.test(candidate)) || manifestCandidates[0];

  return {
    frames: frames ? frames.path : FRAMES_DIR,
    annotations,
    ...(manifest ? { manifest } : {})
  };
};

/**
 * Read the uploaded zip's central directory — the index at the tail of the
 * archive — rather than streaming its contents. Entry *names* are all the
 * mapping step needs, and this keeps the request O(entries) instead of
 * O(bytes): a 700 MB bundle answers in milliseconds, well inside any proxy's
 * read timeout, and nothing is decompressed.
 */
export const previewZip = async (zipFileId: string): Promise<ZipPreview> => {
  const size = await files.getFileSize(zipFileId);
  const archive = await unzipper.Open.custom({
    size: async () => size,
    stream: (offset: number, length?: number) => {
      const start = offset < 0 ? Math.max(size + offset, 0) : offset;
      const end = length ? start + length - 1 : size - 1;
      const passThrough = new PassThrough();
      files
        .getFileRange(zipFileId, start, end)
        .then((stream) => stream.pipe(passThrough))
        .catch((err) => passThrough.destroy(err as Error));
      return passThrough;
    }
  });

  const folders = new Map<string, ZipFolderSummary>();
  const manifestCandidates: string[] = [];
  let entries = 0;

  for (const entry of archive.files as ZipDirectoryEntry[]) {
    if (entry.type === 'Directory') {
      continue;
    }

    const normalized = path.posix.normalize(entry.path.replace(/\\/g, '/')).replace(/^\/+/, '');
    if (normalized.startsWith('..') || OS_JUNK.test(normalized) || normalized.endsWith('/')) {
      continue;
    }

    entries += 1;
    if (entries > MAX_ENTRIES) {
      throw new Error(`Zip exceeds ${MAX_ENTRIES} entries`);
    }
    tally(folders, normalized);
    if (/\.(csv|jsonl)$/i.test(normalized) && manifestCandidates.length < 20) {
      manifestCandidates.push(normalized);
    }
  }

  const summaries = [...folders.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    entries,
    truncated: folders.size >= MAX_FOLDERS,
    folders: summaries,
    manifestCandidates,
    suggestion: suggestMapping(summaries, manifestCandidates)
  };
};
