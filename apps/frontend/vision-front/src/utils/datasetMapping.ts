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

const uniqueNames = (folders: string[]): FolderMapping[] => {
  const names = folders.map((folder) => basename(folder) || 'root');
  return folders.map((folder, index) => ({
    folder,
    group: names.filter((name) => name === names[index]).length > 1 ? folder.replace(/\//g, '_') || 'root' : names[index]
  }));
};

/**
 * A first guess at the mapping: every folder that holds images or JSON directly
 * becomes a group named after it. A zip with many such folders is grouped by its
 * top-level folders instead. The user edits this before importing.
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
  if (leaves.length <= MAX_SUGGESTED_GROUPS) return uniqueNames(leaves);

  const topLevel = contents.folders.filter((folder) => folder.depth === 1 && (folder.images > 0 || folder.jsons > 0)).map((folder) => folder.path);
  const rootCounts = direct.get('');
  const rows = uniqueNames(topLevel);
  return rootCounts && (rootCounts.images > 0 || rootCounts.jsons > 0) ? [{ folder: '', group: 'root' }, ...rows] : rows;
};
