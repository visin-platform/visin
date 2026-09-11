import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BadRequestError, ConflictError, ForbiddenError, HttpError, getUploadPolicy, type UploadPolicy } from '@visin/backend-core';
import { openUploadStore, type UploadState } from './uploadStore';
import { resolvePath } from '../utils/paths';
import type { UploadPart } from '../models/FileUpload';

export interface ChunkRange { start: number; end: number; total: number }
export function parseContentRange(header: string | undefined): ChunkRange | null {
  if (header === undefined) return null;
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
  if (!match) throw new BadRequestError('Malformed Content-Range');
  const [start, end, total] = match.slice(1).map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || end >= total) throw new BadRequestError('Invalid Content-Range');
  return { start, end, total };
}
export function parseContentLength(header: string | undefined): number | undefined {
  if (header === undefined) return undefined;
  if (!/^\d+$/.test(header) || !Number.isSafeInteger(Number(header))) throw new BadRequestError('Invalid Content-Length');
  return Number(header);
}

export async function reserveFileUpload(fileId: string, mimetype: string | undefined, expiresMs: number, maxBytes?: number): Promise<string> {
  const policy = getUploadPolicy(fileId, mimetype);
  if (maxBytes !== undefined) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > policy.maxBytes) throw new BadRequestError('Invalid upload byte allowance');
    policy.maxBytes = maxBytes;
  }
  const store = await openUploadStore(fileId);
  try {
    const existing = store.read();
    if (existing) {
      if (existing.mode !== 'public' || existing.status !== 'uploading' || JSON.stringify(existing.policy) !== JSON.stringify(policy)) throw new ConflictError('Upload path is already reserved');
      existing.expiresMs = expiresMs;
      await store.save(existing);
      return existing.reservationId!;
    }
    if (fs.existsSync(resolvePath(fileId))) throw new ConflictError('File already exists');
    const reservationId = randomUUID();
    await store.save({ fileId: store.fileId, mode: 'public', reservationId, expiresMs, policy, offset: 0, total: null, status: 'uploading', parts: [] });
    return reservationId;
  } finally { await store.close(); }
}

/** Reject excess bytes before forwarding a buffer to disk. The request itself is
 * kept outside pipeline so a 4xx response can be sent before closing its socket. */
async function receive(body: Readable, stage: string, signal: AbortSignal, limit: number, expected?: number): Promise<number> {
  signal.throwIfAborted();
  if (body.destroyed) throw new BadRequestError('Upload interrupted');
  let count = 0;
  const bounded = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    if (chunk.length > limit - count) return callback(new HttpError(413, 'Upload exceeds its byte allowance'));
    count += chunk.length;
    callback(null, chunk);
  } });
  const output = fs.createWriteStream(stage, { flags: 'wx' });
  const fail = (error: Error) => bounded.destroy(error);
  const aborted = () => fail(new BadRequestError('Upload interrupted'));
  const timer = setTimeout(() => fail(new HttpError(408, 'Upload timed out')), 5 * 60 * 1000);
  timer.unref();
  body.on('error', fail).on('aborted', aborted);
  try {
    const written = pipeline(bounded, output, { signal });
    body.pipe(bounded);
    await written;
    if (expected !== undefined && count !== expected) throw new BadRequestError('Upload length does not match its declaration');
    return count;
  } finally {
    clearTimeout(timer);
    body.unpipe(bounded);
    body.pause();
    body.off('error', fail).off('aborted', aborted);
  }
}

/** Bounded format gate; archive entry/decompression validation remains with ingest. */
export function validateContent(stage: string, policy: UploadPolicy): void {
  const fd = fs.openSync(stage, 'r');
  const bytes = Buffer.alloc(512);
  let length: number;
  try { length = fs.readSync(fd, bytes, 0, bytes.length, 0); } finally { fs.closeSync(fd); }
  const data = bytes.subarray(0, length);
  const text = (start: number, end: number) => data.subarray(start, end).toString('ascii');
  const starts = (hex: string) => data.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const allowed: Record<UploadPolicy['format'], boolean> = {
    zip: starts('504b0304') || starts('504b0506'),
    gzip: starts('1f8b08'),
    tar: length >= 512 && text(257, 262) === 'ustar',
    png: starts('89504e470d0a1a0a'),
    jpeg: starts('ffd8ff'),
    gif: text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a',
    webp: text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP',
    mp4: text(4, 8) === 'ftyp',
    mov: ['ftyp', 'moov', 'mdat', 'wide'].includes(text(4, 8)),
    pdf: text(0, 5) === '%PDF-'
  };
  if (!allowed[policy.format]) throw new BadRequestError('Uploaded content does not match its reserved format');
}

function syncDirectory(directory: string): void {
  const fd = fs.openSync(directory, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function durable(stage: string): void {
  const fd = fs.openSync(stage, 'r');
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  syncDirectory(path.dirname(stage));
}
/** Assemble once at completion, rather than copying the growing prefix for every
 * chunk. Both the output and each committed part are immutable. */
async function assemble(store: Awaited<ReturnType<typeof openUploadStore>>, parts: UploadPart[]): Promise<string> {
  if (parts.length === 1) return parts[0].id;
  const id = store.candidate('blob');
  async function* bytes() {
    for (const part of parts) {
      const input = fs.createReadStream(store.path(part.id));
      let size = 0;
      for await (const chunk of input) { size += chunk.length; yield chunk; }
      if (size !== part.size) throw new Error('Committed upload part is incomplete');
    }
  }
  await pipeline(bytes(), fs.createWriteStream(store.path(id), { flags: 'wx' }), { signal: store.signal });
  return id;
}

interface UploadOptions {
  reservationId?: string; range?: ChunkRange | null; contentLength?: number; internal?: boolean
}
export async function uploadFile(fileId: string, body: Readable, options: UploadOptions) {
  // Capture disconnects while asynchronous Mongo acquisition is in progress too.
  let interrupted = false;
  const disconnected = () => { interrupted = true; };
  body.on('error', disconnected).on('aborted', disconnected);
  try { return await writeUpload(fileId, body, options, () => interrupted); }
  finally { body.off('error', disconnected).off('aborted', disconnected); }
}
async function writeUpload(fileId: string, body: Readable, options: UploadOptions, interrupted: () => boolean): Promise<{ size: number; complete: boolean; conflict?: boolean }> {
  const store = await openUploadStore(fileId);
  let state: UploadState | undefined;
  try {
    state = store.read();
    if (options.internal) {
      if (state?.mode === 'public' || state?.status === 'retired') throw new ConflictError('Reserved files cannot be overwritten');
      state = { fileId: store.fileId, mode: 'internal', offset: 0, total: null, status: 'uploading', parts: [], published: state?.published };
      await store.save(state);
    } else {
      if (!state || state.mode !== 'public' || state.reservationId !== options.reservationId || state.status === 'retired' || state.expiresMs! < Date.now()) throw new ForbiddenError('Upload reservation is not available');
      if (state.status === 'complete') return { size: state.offset, complete: true, conflict: Boolean(options.range) };
    }
    const range = options.range;
    const maximum = state.policy?.maxBytes ?? 10 * 1024 ** 3;
    const expected = range ? range.end - range.start + 1 : options.contentLength;
    const total = range?.total ?? options.contentLength;
    if (total !== undefined && total > maximum) throw new HttpError(413, 'Upload exceeds its byte allowance');
    if (range && options.contentLength !== undefined && options.contentLength !== expected) throw new BadRequestError('Content-Length does not match Content-Range');
    if (range && state.total !== null && state.total !== range.total) throw new BadRequestError('Upload total cannot change');
    if ((range?.start ?? 0) !== state.offset) return { size: state.offset, complete: false, conflict: true };
    if (expected !== undefined && expected > maximum - state.offset) throw new HttpError(413, 'Upload exceeds its byte allowance');
    if (state.parts.length >= 4096) throw new BadRequestError('Upload has too many chunks');
    if (range) { state.total = range.total; await store.save(state); }
    if (interrupted()) throw new BadRequestError('Upload interrupted');
    const id = store.candidate('part');
    const received = await receive(body, store.path(id), store.signal, expected ?? maximum - state.offset, expected);
    durable(store.path(id));
    const size = state.offset + received;
    const complete = !range || size === range.total;
    state.parts.push({ id, size: received });
    state.offset = size;
    if (complete) {
      const publishedId = await assemble(store, state.parts);
      if (state.policy) validateContent(store.path(publishedId), state.policy);
      durable(store.path(publishedId));
      state.published = { id: publishedId, size, lastModified: new Date().toISOString() };
      state.parts = [];
      state.total = size;
      state.status = 'complete';
    }
    // This conditional update is publication. If its acknowledgement is lost,
    // leave candidate bytes intact: the update may have committed. The next
    // owner collects only files absent from Mongo's authoritative state.
    await store.save(state);
    return { size, complete };
  } finally { await store.close(); }
}
