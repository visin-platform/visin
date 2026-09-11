import fs from 'fs';
import path from 'path';
import { logger, NotFoundError } from '@visin/backend-core';

import { dataDir, CONTROL_DIRECTORY, resolvePath } from './paths';
import { openUploadStore, pendingFileIds, readUploadState, uploadLocation } from '../services/uploadStore';
import { FileUpload } from '../models/FileUpload';
export { resolvePath } from './paths';
const DATA_DIR = dataDir;
const resolveSafePath = resolvePath;

/** Resolve Mongo's pointer, then open a single descriptor. Once open, an
 * overlapping replacement/collection cannot mix metadata and file contents. */
async function openPublished(fileId: string): Promise<number> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const state = await readUploadState(fileId);
    if (state?.status === 'retired' || (state?.mode === 'public' && !state.published)) throw new NotFoundError('File not found');
    const target = state?.published
      ? path.join(uploadLocation(fileId).directory, state.published.id)
      : resolvePath(fileId);
    try { return fs.openSync(target, 'r'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new NotFoundError('File not found');
}
export async function openRead(fileId: string, selectRange?: (size: number) => { start: number; end: number } | null) {
  const fd = await openPublished(fileId);
  try {
    const stat = fs.fstatSync(fd);
    const range = selectRange?.(stat.size) ?? null;
    const stream = fs.createReadStream('', { fd, autoClose: true, ...(range ?? {}) });
    return { size: stat.size, lastModified: stat.mtime, stream, range };
  } catch (error) { fs.closeSync(fd); throw error; }
}

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
export const readFile = async (fileId: string): Promise<Buffer> => {
  const fd = await openPublished(fileId);
  try { return fs.readFileSync(fd); } finally { fs.closeSync(fd); }
};

export const createReadStream = async (fileId: string, range?: { start: number; end: number }): Promise<fs.ReadStream> => {
  return (await openRead(fileId, () => range ?? null)).stream;
};

export const fileExists = async (fileId: string): Promise<boolean> => {
  try {
    const fd = await openPublished(fileId);
    try { return fs.fstatSync(fd).isFile(); } finally { fs.closeSync(fd); }
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
};

export const getMetadata = async (fileId: string): Promise<{ size: number; lastModified: Date }> => {
  const fd = await openPublished(fileId);
  try { const stat = fs.fstatSync(fd); return { size: stat.size, lastModified: stat.mtime }; }
  finally { fs.closeSync(fd); }
};

/**
 * Delete a single file.
 */
export const deleteFile = async (fileId: string): Promise<void> => {
  const store = await openUploadStore(fileId);
  try {
    const state = store.read();
    await store.save({ ...(state ?? { fileId: store.fileId, mode: 'internal', offset: 0, total: null }), parts: [], published: undefined, status: 'retired' });
    fs.rmSync(resolvePath(fileId), { force: true });
    for (const id of new Set([...(state?.parts ?? []).map(part => part.id), state?.published?.id])) {
      if (id) fs.rmSync(store.path(id), { force: true });
    }
  } finally { await store.close(); }
};

/** Cancel pending reservations as well as published files; retain tombstones so
 * deleting a resource cannot make an old upload capability writable again. */
export const deleteByPrefix = async (prefix: string): Promise<number> => {
  const base = resolveSafePath(prefix);
  const normalized = path.relative(dataDir(), base);
  const pending = await pendingFileIds();
  const directoryPrefix = pending.some(fileId => fileId.startsWith(normalized + path.sep)) || prefix.endsWith('/') || (fs.existsSync(base) && fs.statSync(base).isDirectory());
  const matches = (fileId: string): boolean => !normalized || (directoryPrefix
    ? fileId.startsWith(normalized + path.sep)
    : path.dirname(fileId) === path.dirname(normalized) && path.basename(fileId).startsWith(path.basename(normalized)));
  const published = (await listFiles(directoryPrefix ? normalized : path.dirname(normalized), Number.MAX_SAFE_INTEGER, directoryPrefix))
    .filter(file => matches(file.name)).map(file => file.name);
  for (const fileId of new Set([...published, ...pending.filter(matches)])) await deleteFile(fileId);
  // Preserve folder-delete behavior without ever walking the control namespace.
  const prune = (directory: string): void => {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (child !== path.join(dataDir(), CONTROL_DIRECTORY) && entry.isDirectory()) prune(child);
    }
    if (directory !== dataDir() && fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  };
  prune(base);
  return published.length;
};

/**
 * List all files under an optional prefix, up to maxKeys.
 */
export const listFiles = async (
  prefix?: string,
  maxKeys = 1000,
  recursive = true
): Promise<Array<{ name: string; size: number; lastModified: Date }>> => {
  const baseDir = prefix ? resolveSafePath(prefix) : path.resolve(DATA_DIR());

  const normalized = path.relative(dataDir(), baseDir);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = (normalized ? `^${escaped}/` : '^') + (recursive ? '' : '[^/]+$');
  const managed = await FileUpload.find({ fileId: { $regex: pattern } }, { fileId: 1, 'state.published': 1, 'state.mode': 1, 'state.status': 1 }).readConcern('majority').lean();
  const managedIds = new Set(managed.filter(row => row.state?.published || row.state?.mode === 'public' || row.state?.status === 'retired').map(row => row.fileId));
  const results: Array<{ name: string; size: number; lastModified: Date }> = [];

  const walk = (dir: string): void => {
    if (results.length >= maxKeys || !fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxKeys) break;
      const full = path.join(dir, entry.name);
      if (full === path.join(dataDir(), CONTROL_DIRECTORY)) continue;
      if (entry.isDirectory()) {
        // Shallow listing exists so a caller can find the handful of files
        // directly under a folder without paging past everything beneath it —
        // a bundle's uploaded zips sit beside tens of thousands of imported
        // frames, which would otherwise consume the whole maxKeys budget.
        if (recursive) {
          walk(full);
        }
      } else {
        if (managedIds.has(path.relative(DATA_DIR(), full))) continue;
        const stat = fs.statSync(full);
        results.push({ name: path.relative(DATA_DIR(), full), size: stat.size, lastModified: stat.mtime });
      }
    }
  };

  walk(baseDir);
  for (const row of managed) {
    if (results.length >= maxKeys) break;
    if (!recursive && path.dirname(row.fileId) !== (normalized || '.')) continue;
    if (row.state?.status === 'retired' || !row.state?.published) continue;
    results.push({ name: row.fileId, size: row.state.published.size, lastModified: new Date(row.state.published.lastModified) });
  }
  return results;
};
