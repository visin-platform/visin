import fs from 'fs';
import path from 'path';
import { logger } from '@visin/backend-core';

const DATA_DIR = (): string => process.env.FILE_SERVICE_DATA_DIR || '/data';

/**
 * Resolve a path under DATA_DIR, rejecting anything that escapes it.
 * Checking the resolved path is a construction-proof guard against path
 * traversal (../, absolute paths, ..%2f-style tricks after decoding, etc.),
 * unlike stripping leading ".." segments with a regex.
 */
const resolveSafePath = (relativePath: string): string => {
  const dataDir = path.resolve(DATA_DIR());
  const resolved = path.resolve(dataDir, relativePath);
  if (resolved !== dataDir && !resolved.startsWith(dataDir + path.sep)) {
    throw new Error(`Invalid path: escapes data directory (${relativePath})`);
  }
  return resolved;
};

/**
 * Resolve the absolute path for a fileId.
 * fileId is already a path like "groupId/albumId/fileId/original.jpg"
 */
export const resolvePath = (fileId: string): string => resolveSafePath(fileId);

/**
 * Ensure the directory for a file path exists.
 */
export const ensureDir = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

/**
 * Write a buffer to disk.
 */
export const writeFile = (fileId: string, buffer: Buffer): void => {
  const filePath = resolvePath(fileId);
  ensureDir(filePath);
  fs.writeFileSync(filePath, buffer);
  logger.info('File written', { fileId, size: buffer.length });
};

/**
 * Create a writable stream for a file.
 */
export const createWriteStream = (fileId: string): fs.WriteStream => {
  const filePath = resolvePath(fileId);
  ensureDir(filePath);
  return fs.createWriteStream(filePath);
};

/**
 * Create a writable stream positioned at `start`, leaving the bytes before it
 * intact. The resumable-upload path writes every chunk at its own offset rather
 * than appending blindly, so a chunk that gets re-sent after a network failure
 * overwrites itself instead of being duplicated onto the end of the file.
 *
 * Uses 'r+' rather than 'a': append mode ignores `start` and always writes at
 * the current end, which is exactly the duplication this avoids.
 */
export const createWriteStreamAt = (fileId: string, start: number): fs.WriteStream => {
  const filePath = resolvePath(fileId);
  ensureDir(filePath);
  return fs.createWriteStream(filePath, { flags: 'r+', start });
};

/**
 * Cut a file back to `size` bytes. Used to roll a partially written chunk back
 * to the last offset the client and server agreed on.
 */
export const truncateFile = (fileId: string, size: number): void => {
  fs.truncateSync(resolvePath(fileId), size);
  logger.info('File truncated', { fileId, size });
};

/**
 * Read a file from disk and return a Buffer.
 */
export const readFile = (fileId: string): Buffer => {
  const filePath = resolvePath(fileId);
  return fs.readFileSync(filePath);
};

/**
 * Create a readable stream for a file.
 */
export const createReadStream = (fileId: string, range?: { start: number; end: number }): fs.ReadStream => {
  const filePath = resolvePath(fileId);
  return fs.createReadStream(filePath, range);
};

/**
 * Check if a file exists.
 */
export const fileExists = (fileId: string): boolean => {
  try {
    return fs.statSync(resolvePath(fileId)).isFile();
  } catch {
    return false;
  }
};

/**
 * Get file metadata.
 */
export const getMetadata = (fileId: string): { size: number; lastModified: Date } => {
  const stat = fs.statSync(resolvePath(fileId));
  return { size: stat.size, lastModified: stat.mtime };
};

/**
 * Delete a single file.
 */
export const deleteFile = (fileId: string): void => {
  const filePath = resolvePath(fileId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info('File deleted', { fileId });
  }
};

/**
 * Delete all files whose relative path starts with prefix (folder delete).
 */
export const deleteByPrefix = (prefix: string): number => {
  const base = resolveSafePath(prefix);
  let count = 0;

  const removeDir = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        removeDir(full);
      } else {
        fs.unlinkSync(full);
        count++;
      }
    }
    // Remove the now-empty directory
    try { fs.rmdirSync(dir); } catch { /* ignore non-empty */ }
  };

  // If prefix points to a directory, remove the whole subtree.
  // If it points to a file prefix (no trailing slash), remove matching files.
  const stat = fs.existsSync(base) ? fs.statSync(base) : null;
  if (stat?.isDirectory()) {
    removeDir(base);
  } else {
    // Treat as filename prefix — walk parent dir and delete matches
    const parentDir = path.dirname(base);
    const filePrefix = path.basename(base);
    if (fs.existsSync(parentDir)) {
      for (const name of fs.readdirSync(parentDir)) {
        if (name.startsWith(filePrefix)) {
          fs.unlinkSync(path.join(parentDir, name));
          count++;
        }
      }
    }
  }

  logger.info('Deleted files under prefix', { count, prefix });
  return count;
};

/**
 * List all files under an optional prefix, up to maxKeys.
 */
export const listFiles = (
  prefix?: string,
  maxKeys = 1000,
  recursive = true
): Array<{ name: string; size: number; lastModified: Date }> => {
  const baseDir = prefix ? resolveSafePath(prefix) : path.resolve(DATA_DIR());

  const results: Array<{ name: string; size: number; lastModified: Date }> = [];

  const walk = (dir: string): void => {
    if (results.length >= maxKeys || !fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxKeys) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Shallow listing exists so a caller can find the handful of files
        // directly under a folder without paging past everything beneath it —
        // a bundle's uploaded zips sit beside tens of thousands of imported
        // frames, which would otherwise consume the whole maxKeys budget.
        if (recursive) {
          walk(full);
        }
      } else {
        const stat = fs.statSync(full);
        results.push({ name: path.relative(DATA_DIR(), full), size: stat.size, lastModified: stat.mtime });
      }
    }
  };

  walk(baseDir);
  return results;
};
