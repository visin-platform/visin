import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { PassThrough, Readable } from 'node:stream';
import { useMongo } from '../helpers/mongo';
import { FileUpload } from '../../models/FileUpload';
import { openUploadStore, readUploadState, uploadLocation, UPLOAD_LEASE_MS } from '../../services/uploadStore';
import { reserveFileUpload, uploadFile } from '../../services/uploadService';
import { deleteFile, fileExists, getMetadata, listFiles, openRead, readFile, writeFile } from '../../utils/storage';

useMongo();
let directory: string;
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('abcdefgh')]);
const send = (body = png) => Readable.from([body]);
const reserve = () => reserveFileUpload('test.png', 'image/png', Date.now() + 60_000, 16);
const expire = () => FileUpload.updateOne({ fileId: 'test.png' }, { $set: { leaseUntil: new Date(0) } });
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mongo-uploads-'));
  process.env.FILE_SERVICE_DATA_DIR = directory;
});
afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.FILE_SERVICE_DATA_DIR;
});

it('fences stale commits and releases without disturbing the next owner', async () => {
  await reserve();
  const stale = await openUploadStore('test.png');
  const original = stale.read()!;
  await expire();
  const current = await openUploadStore('test.png');
  try {
    await expect(stale.save({ ...original, status: 'retired' })).rejects.toThrow('ownership expired');
    await stale.close();
    await expect(openUploadStore('test.png')).rejects.toThrow('Another upload');
    await current.save({ ...original, expiresMs: 123 });
    expect((await readUploadState('test.png'))?.expiresMs).toBe(123);
  } finally { await current.close(); }
});

it('allows exactly one writer when a file record is created concurrently', async () => {
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => openUploadStore('test.png')));
  expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  for (const result of attempts) if (result.status === 'fulfilled') await result.value.close();
  expect(await FileUpload.countDocuments()).toBe(1);
});

it('cannot publish stale bytes after a competing writer completes', async () => {
  const reservationId = await reserve();
  const body = new PassThrough();
  const old = uploadFile('test.png', body, { reservationId });
  const rejected = expect(old).rejects.toThrow();
  body.write(png.subarray(0, 8));
  while (body.listenerCount('aborted') < 2) await new Promise<void>(resolve => setImmediate(resolve));
  await expire();
  await uploadFile('test.png', send(), { reservationId });
  body.end(Buffer.from('attacker'));
  await rejected;
  expect(await readFile('test.png')).toEqual(png);
  expect((await readUploadState('test.png'))?.status).toBe('complete');
});

it.each([false, true])('recovers publication when the database write fails (committed=%s)', async committed => {
  const reservationId = await reserve();
  const update = FileUpload.collection.updateOne.bind(FileUpload.collection);
  const failure = jest.spyOn(FileUpload.collection, 'updateOne').mockImplementation(async (...args) => {
    if (!Array.isArray(args[1]) && args[1].$set?.state?.status === 'complete') {
      if (committed) await update(...args);
      throw new Error('Mongo acknowledgement lost');
    }
    return update(...args);
  });
  await expect(uploadFile('test.png', send(), { reservationId })).rejects.toThrow('acknowledgement lost');
  failure.mockRestore();
  expect(await fileExists('test.png')).toBe(committed);
  expect((await uploadFile('test.png', send(), { reservationId })).complete).toBe(true);
  expect(await readFile('test.png')).toEqual(png);
});

it('preserves the old file if an internal replacement cannot commit', async () => {
  await uploadFile('test.png', send(), { internal: true });
  const update = FileUpload.collection.updateOne.bind(FileUpload.collection);
  jest.spyOn(FileUpload.collection, 'updateOne').mockImplementation(async (...args) => {
    if (!Array.isArray(args[1]) && args[1].$set?.state?.status === 'complete') throw new Error('Mongo unavailable');
    return update(...args);
  });
  await expect(uploadFile('test.png', send(Buffer.from('replacement')), { internal: true })).rejects.toThrow('unavailable');
  expect(await readFile('test.png')).toEqual(png);
});

it('fails reads and writes closed when Mongo is unavailable, including legacy files', async () => {
  writeFile('test.png', png);
  jest.spyOn(FileUpload.collection, 'findOne').mockRejectedValue(new Error('Mongo unavailable'));
  jest.spyOn(FileUpload.collection, 'updateOne').mockRejectedValue(new Error('Mongo unavailable'));
  await expect(fileExists('test.png')).rejects.toThrow('Mongo unavailable');
  await expect(reserve()).rejects.toThrow('Mongo unavailable');
  await expect(uploadFile('test.png', send(), { internal: true })).rejects.toThrow('Mongo unavailable');
});

it.each(['error', 'aborted'])('captures a disconnect during asynchronous ownership acquisition (%s)', async event => {
  const reservationId = await reserve();
  const body = new PassThrough();
  const pending = uploadFile('test.png', body, { reservationId });
  const rejected = expect(pending).rejects.toThrow('interrupted');
  body.emit(event, new Error('disconnect'));
  await rejected;
  expect(await fileExists('test.png')).toBe(false);
  body.destroy();
});

function fastHeartbeat() {
  const interval = global.setInterval;
  jest.spyOn(global, 'setInterval').mockImplementation(((fn: () => void, delay?: number) => interval(fn, delay === UPLOAD_LEASE_MS / 3 ? 20 : delay)) as typeof setInterval);
}
it('renews active ownership using the database clock', async () => {
  await reserve();
  fastHeartbeat();
  const store = await openUploadStore('test.png');
  try {
    const before = (await FileUpload.findOne({ fileId: 'test.png' }).lean())!.leaseUntil!.getTime();
    await new Promise(resolve => setTimeout(resolve, 60));
    const after = (await FileUpload.findOne({ fileId: 'test.png' }).lean())!.leaseUntil!.getTime();
    expect(after).toBeGreaterThan(before);
    expect(store.signal.aborted).toBe(false);
  } finally { await store.close(); }
});

it.each(['expired', 'database failure'])('aborts work when the heartbeat fails (%s)', async reason => {
  await reserve();
  fastHeartbeat();
  const store = await openUploadStore('test.png');
  try {
    if (reason === 'expired') await expire();
    else jest.spyOn(FileUpload.collection, 'updateOne').mockRejectedValue(new Error('Mongo unavailable'));
    await once(store.signal, 'abort', { signal: AbortSignal.timeout(2000) });
    await expect(store.save(store.read()!)).rejects.toThrow(reason === 'expired' ? 'ownership expired' : 'Mongo unavailable');
  } finally { await store.close(); }
});

it('releases ownership if collection of abandoned files fails', async () => {
  const reservationId = await reserve();
  await expect(uploadFile('test.png', send(Buffer.from('invalid')), { reservationId })).rejects.toThrow('content');
  jest.spyOn(fs, 'rmSync').mockImplementationOnce(() => { throw new Error('disk error'); });
  await expect(openUploadStore('test.png')).rejects.toThrow('disk error');
  expect((await FileUpload.findOne({ fileId: 'test.png' }).lean())?.owner).toBeUndefined();
  expect((await uploadFile('test.png', send(), { reservationId })).complete).toBe(true);
});

it('rejects excessive chunk manifests and truncated committed parts', async () => {
  const reservationId = await reserve();
  await uploadFile('test.png', send(png.subarray(0, 8)), { reservationId, range: { start: 0, end: 7, total: 16 } });
  const state = (await readUploadState('test.png'))!;
  await FileUpload.updateOne({ fileId: 'test.png' }, { $set: { 'state.parts': Array(4096).fill(state.parts[0]) } });
  await expect(uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).rejects.toThrow('too many chunks');
  await FileUpload.updateOne({ fileId: 'test.png' }, { $set: { 'state.parts': state.parts } });
  fs.truncateSync(path.join(uploadLocation('test.png').directory, state.parts[0].id), 3);
  await expect(uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).rejects.toThrow('incomplete');
  expect(await fileExists('test.png')).toBe(false);
});

it('lists Mongo versions with directory boundaries and hides replaced legacy bytes', async () => {
  writeFile('a.b/legacy.png', Buffer.from('legacy'));
  await uploadFile('a.b/legacy.png', send(), { internal: true });
  await uploadFile('a.b/nested/test.png', send(), { internal: true });
  await uploadFile('axb/other.png', send(), { internal: true });
  expect((await listFiles('a.b', 10, false)).map(file => [file.name, file.size])).toEqual([['a.b/legacy.png', png.length]]);
  expect(await listFiles('a.b', 1)).toHaveLength(1);
  expect(await getMetadata('a.b/legacy.png')).toMatchObject({ size: png.length });
  await deleteFile('a.b/legacy.png');
  expect(await fileExists('a.b/legacy.png')).toBe(false);
});

it('closes descriptors on range selection failure and retries a collected snapshot', async () => {
  await uploadFile('test.png', send(), { internal: true });
  await expect(openRead('test.png', () => { throw new Error('invalid range'); })).rejects.toThrow('invalid range');
  const original = fs.openSync;
  let missing = true;
  jest.spyOn(fs, 'openSync').mockImplementation((...args) => {
    if (missing && String(args[0]).endsWith('.part')) { missing = false; throw Object.assign(new Error('collected'), { code: 'ENOENT' }); }
    return original(...args);
  });
  expect(await readFile('test.png')).toEqual(png);
});
