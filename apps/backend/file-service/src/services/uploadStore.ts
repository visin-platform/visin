import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ConflictError, logger } from '@visin/backend-core';
import { FileUpload, type UploadState } from '../models/FileUpload';
import { CONTROL_DIRECTORY, dataDir, resolvePath } from '../utils/paths';
export type { UploadState } from '../models/FileUpload';

export const UPLOAD_LEASE_MS = 30_000;
export function uploadLocation(fileId: string) {
  const normalized = path.relative(dataDir(), resolvePath(fileId));
  if (!normalized) throw new Error('A file path is required');
  const key = createHash('sha256').update(normalized).digest('hex');
  return { fileId: normalized, key, directory: path.join(dataDir(), CONTROL_DIRECTORY, key) };
}
export async function readUploadState(fileId: string): Promise<UploadState | undefined> {
  const row = await FileUpload.findById(uploadLocation(fileId).key).readConcern('majority').lean();
  return row?.state;
}

/** Mongo owns the visible pointer. A lease only coordinates work: every state
 * commit is fenced, and each request writes immutable, uniquely named bytes.
 * A paused writer can never overwrite a replacement after losing its lease. */
export async function openUploadStore(fileId: string) {
  const location = uploadLocation(fileId);
  fs.mkdirSync(location.directory, { recursive: true });
  // Persist newly created directory entries before publishing a pointer to bytes.
  for (const directory of [path.dirname(location.directory), dataDir()]) {
    const fd = fs.openSync(directory, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  // Capture before claiming. Never collect files created by a subsequent owner.
  const candidates = fs.readdirSync(location.directory);
  try {
    await FileUpload.updateOne({ _id: location.key }, { $setOnInsert: { fileId: location.fileId } }, { upsert: true, writeConcern: { w: 'majority' } });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
  const owner = randomUUID();
  const row = await FileUpload.findOneAndUpdate({
    _id: location.key,
    $or: [{ owner: { $exists: false } }, { $expr: { $lte: ['$leaseUntil', '$$NOW'] } }]
  }, [{ $set: { owner, leaseUntil: { $add: ['$$NOW', UPLOAD_LEASE_MS] } } }], {
    updatePipeline: true, returnDocument: 'after', writeConcern: { w: 'majority' }
  }).lean();
  if (!row) throw new ConflictError('Another upload is writing this file');
  let state = row.state;
  const abort = new AbortController();
  const owned = { _id: location.key, owner, $expr: { $gt: ['$leaseUntil', '$$NOW'] } };
  let renewing = false;
  const renew = async () => {
    if (renewing || abort.signal.aborted) return;
    renewing = true;
    try {
      const result = await FileUpload.updateOne(owned, [{ $set: { leaseUntil: { $add: ['$$NOW', UPLOAD_LEASE_MS] } } }], { updatePipeline: true, writeConcern: { w: 'majority' } });
      if (!result.matchedCount) throw new ConflictError('Upload ownership expired');
    } catch (error) { abort.abort(error); }
    finally { renewing = false; }
  };
  const timer = setInterval(() => { void renew(); }, UPLOAD_LEASE_MS / 3);
  timer.unref();
  const close = async () => {
    clearInterval(timer);
    abort.abort(new ConflictError('Upload writer closed'));
    // A delayed release must never release a successor's lease.
    try { await FileUpload.updateOne({ _id: location.key, owner }, { $unset: { owner: '', leaseUntil: '' } }, { writeConcern: { w: 'majority' } }); }
    catch { logger.warn('Could not release upload lease; it will expire', { fileId: location.fileId }); }
  };
  try {
    const referenced = new Set([...(state?.parts ?? []).map(part => part.id), state?.published?.id]);
    for (const name of candidates) {
      if (/^[a-f0-9-]+\.(part|blob)$/.test(name) && !referenced.has(name)) fs.rmSync(path.join(location.directory, name), { force: true });
    }
  } catch (error) { await close(); throw error; }
  return {
    fileId: location.fileId,
    candidate: (extension: 'part' | 'blob') => `${owner}.${extension}`,
    path: (id: string) => path.join(location.directory, id),
    signal: abort.signal,
    read: () => state === undefined ? undefined : structuredClone(state),
    save: async (next: UploadState): Promise<void> => {
      abort.signal.throwIfAborted();
      const result = await FileUpload.updateOne(owned, { $set: { state: next } }, { writeConcern: { w: 'majority' } });
      if (!result.matchedCount) throw new ConflictError('Upload ownership expired');
      state = structuredClone(next);
    },
    close
  };
}

export async function pendingFileIds(): Promise<string[]> {
  return (await FileUpload.find({}, { fileId: 1 }).readConcern('majority').lean()).map(row => row.fileId);
}
