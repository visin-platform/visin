import type { ContentsFolder, DatasetContents, FolderMapping } from '../services/datasetService';

/** 1536 → "1.5 KB". Binary units, one decimal above bytes. */
export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.max(0, bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

export const folderLabel = (folderPath: string): string => folderPath || '(zip root)';

const basename = (folderPath: string): string => folderPath.slice(folderPath.lastIndexOf('/') + 1);

/** A folder's own name, for a tree whose indentation already shows where it sits. */
export const folderName = (folderPath: string): string => basename(folderPath) || '(zip root)';

/**
 * The folders to list as a tree, below the zip root: every level while they fit
 * in `maxRows`, otherwise the deepest levels are left out — a zip with a folder
 * per sequence would otherwise bury its top-level layout under thousands of rows.
 */
export const visibleFolders = (folders: ContentsFolder[], maxRows: number): { rows: ContentsFolder[]; omittedDeeper: boolean } => {
  const nested = folders.filter((folder) => folder.depth > 0).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  let depth = Math.max(0, ...nested.map((folder) => folder.depth));
  let rows = nested;
  while (rows.length > maxRows && depth > 1) {
    depth -= 1;
    rows = nested.filter((folder) => folder.depth <= depth);
  }
  return { rows, omittedDeeper: rows.length < nested.length };
};

const parentOf = (folderPath: string): string | null => {
  if (folderPath === '') return null;
  const slash = folderPath.lastIndexOf('/');
  return slash === -1 ? '' : folderPath.slice(0, slash);
};

/**
 * Images and JSON files sitting directly in each folder. `contents` counts
 * everything beneath a folder, so a folder's own files are its total minus its
 * children's.
 */
export const directCounts = (folders: ContentsFolder[]): Map<string, { images: number; jsons: number }> => {
  const direct = new Map(folders.map((folder) => [folder.path, { images: folder.images, jsons: folder.jsons }]));
  for (const folder of folders) {
    const parent = parentOf(folder.path);
    const counts = parent === null ? undefined : direct.get(parent);
    if (counts) {
      counts.images -= folder.images;
      counts.jsons -= folder.jsons;
    }
  }
  return direct;
};

// Past this many leaf folders a zip is organised by something other than
// content type (one folder per sequence), and one group per folder would bury
// the useful split; the top-level folders are the better starting point.
const MAX_SUGGESTED_GROUPS = 30;

/**
 * Each folder's group is its own name, so folders that share one — the
 * `camera` under every `day/rain`, `night/not_rain`, … — fill one group. A zip
 * split by condition or sequence still browses as its few kinds of image, and
 * each image keeps its full path, so the split itself is not lost.
 */
const namedGroups = (folders: string[]): FolderMapping[] => folders.map((folder) => ({ folder, group: basename(folder) || 'root' }));

/**
 * A first guess at the mapping: every folder that holds images or JSON directly
 * becomes part of the group named after it. A zip with many such folders is
 * grouped by its top-level folders instead. The user edits this before importing.
 */
export const suggestMapping = (contents?: DatasetContents): FolderMapping[] => {
  if (!contents) return [];
  const direct = directCounts(contents.folders);
  const leaves = contents.folders
    .filter((folder) => {
      const counts = direct.get(folder.path)!;
      return counts.images > 0 || counts.jsons > 0;
    })
    .map((folder) => folder.path);
  if (leaves.length === 0) return [];
  if (leaves.length <= MAX_SUGGESTED_GROUPS) return namedGroups(leaves);

  const topLevel = contents.folders.filter((folder) => folder.depth === 1 && (folder.images > 0 || folder.jsons > 0)).map((folder) => folder.path);
  const rootCounts = direct.get('');
  const rows = namedGroups(topLevel);
  return rootCounts && (rootCounts.images > 0 || rootCounts.jsons > 0) ? [{ folder: '', group: 'root' }, ...rows] : rows;
};
