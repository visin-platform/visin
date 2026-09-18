import type { ContentsFolder, DatasetContents } from '../models/Dataset';
import { IMAGE_EXTENSIONS, extensionOf, folderOf, normalizeEntryPath } from './zipPaths';

/**
 * How many images and JSON files an import with these mapped folders will take:
 * the files beneath any mapped folder, each counted once however deep the
 * mapping nests. Undefined when the index left folders out (a truncated one).
 */
export const expectedImportFiles = (contents: DatasetContents | undefined, folders: string[]): number | undefined => {
  if (!contents || contents.truncated) return undefined;
  const beneath = (folder: string, parent: string) => parent === '' || folder.startsWith(`${parent}/`);
  const outermost = [...new Set(folders)].filter((folder) => !folders.some((other) => other !== folder && beneath(folder, other)));
  return outermost.reduce((sum, folder) => {
    const counted = contents.folders.find((row) => row.path === folder);
    return sum + (counted ? counted.images + counted.jsons : 0);
  }, 0);
};

export interface ZipIndexEntry {
  path: string;
  size: number;
}

const MAX_FOLDERS = 2000;
const MAX_EXTENSIONS = 50;

/**
 * What an archive holds, from its entry names and sizes alone.
 *
 * Every folder is counted with everything beneath it, and every ancestor is
 * listed even when it holds no file directly — the mapping step has to be able
 * to pick `segments/` for a zip whose files all sit in `segments/<id>/camera/`.
 * When there are too many folders the deepest go first, since a mapping picks
 * shallow folders far more often than leaves.
 */
export const summarizeContents = (entries: ZipIndexEntry[]): DatasetContents => {
  const folders = new Map<string, ContentsFolder>();
  const extensions = new Map<string, { ext: string; files: number; bytes: number }>();
  let fileCount = 0;
  let totalBytes = 0;

  const folderFor = (folderPath: string): ContentsFolder => {
    let folder = folders.get(folderPath);
    if (!folder) {
      folder = {
        path: folderPath,
        depth: folderPath === '' ? 0 : folderPath.split('/').length,
        files: 0,
        images: 0,
        jsons: 0,
        bytes: 0
      };
      folders.set(folderPath, folder);
    }
    return folder;
  };

  for (const entry of entries) {
    const normalized = normalizeEntryPath(entry.path);
    if (!normalized.ok) continue;
    const size = Number.isFinite(entry.size) && entry.size > 0 ? entry.size : 0;
    const extension = extensionOf(normalized.path) || '(none)';
    const isImage = IMAGE_EXTENSIONS.has(extension);
    const isJson = extension === '.json';

    fileCount += 1;
    totalBytes += size;
    const ext = extensions.get(extension) || { ext: extension, files: 0, bytes: 0 };
    ext.files += 1;
    ext.bytes += size;
    extensions.set(extension, ext);

    // The file counts toward its folder and every ancestor, up to the root.
    let current: string | undefined = folderOf(normalized.path);
    while (current !== undefined) {
      const folder = folderFor(current);
      folder.files += 1;
      folder.bytes += size;
      if (isImage) folder.images += 1;
      if (isJson) folder.jsons += 1;
      current = current === '' ? undefined : folderOf(current);
    }
  }

  const sorted = [...folders.values()].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return {
    entries: fileCount,
    totalBytes,
    truncated: sorted.length > MAX_FOLDERS,
    folders: sorted.slice(0, MAX_FOLDERS).sort((a, b) => a.path.localeCompare(b.path)),
    extensions: [...extensions.values()].sort((a, b) => b.files - a.files).slice(0, MAX_EXTENSIONS)
  };
};
