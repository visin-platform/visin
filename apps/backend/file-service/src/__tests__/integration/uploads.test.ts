import { useMongo } from '../helpers/mongo';
useMongo();
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import express from 'express';
import type { Server } from 'node:http';
import { errorHandler } from '@visin/backend-core';
import routes from '../../routes/routes';
import { uploadFile, reserveFileUpload, parseContentLength, parseContentRange, validateContent } from '../../services/uploadService';
import { openUploadStore, readUploadState, uploadLocation } from '../../services/uploadStore';
import mongoose from 'mongoose';
import { FileUpload } from '../../models/FileUpload';
import { resolvePath, fileExists, readFile, openRead, listFiles, deleteFile, deleteByPrefix } from '../../utils/storage';

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from('abcdefgh')]);
let directory: string;
let server: Server;
let base: string;
const previous = { ...process.env };
beforeAll(async () => {
  process.env.FILE_SERVICE_HMAC_SECRET = 'upload-test-secret';
  process.env.FILE_SERVICE_API_KEY = 'upload-test-internal';
  const app = express(); app.use(routes, errorHandler);
  server = await new Promise<Server>(resolve => { const listening = app.listen(0, '127.0.0.1', () => resolve(listening)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.FILE_SERVICE_URL = base;
});
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-safety-'));
  process.env.FILE_SERVICE_DATA_DIR = directory;
});
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); process.env = previous; });
const reserve = (fileId = 'test.png', maxBytes = png.length) => reserveFileUpload(fileId, 'application/octet-stream', Date.now() + 60_000, maxBytes);
const waitForPipe = (body: Readable) => new Promise<void>(resolve => { const check = () => { if (body.listenerCount('aborted') > 1) resolve(); else setImmediate(check); }; check(); });
const send = (body: Buffer) => Readable.from([body]);
const content = async (stream: Readable) => { const chunks: Buffer[] = []; for await (const chunk of stream) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); };
const state = async (fileId = 'test.png') => (await readUploadState(fileId))!;
const signed = async (fileId = 'test.png', maxBytes = png.length) => {
  const response = await fetch(`${base}/internal/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-api-key': 'upload-test-internal' }, body: JSON.stringify({ fileId, mimetype: 'image/png', maxBytes }) });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { uploadUrl: string } }).data.uploadUrl;
};

describe('bounded and atomic uploads', () => {
  it('binds the capability to its reservation, limits bytes during chunked transfer and retries safely', async () => {
    const url = await signed();
    const tampered = new URL(url); tampered.searchParams.set('reservation', '00000000-0000-0000-0000-000000000000');
    expect((await fetch(tampered, { method: 'PUT', body: png })).status).toBe(403);
    const overflow = await fetch(url, { method: 'PUT', body: Readable.from([png, Buffer.from('overflow')]), duplex: 'half' } as unknown as RequestInit);
    expect(overflow.status).toBe(413);
    expect((await fileExists('test.png'))).toBe(false);
    expect((await state()).offset).toBe(0);
    expect((await fetch(url, { method: 'PUT', body: png })).status).toBe(200);
    expect((await readFile('test.png'))).toEqual(png);
    expect((await fetch(url, { method: 'PUT', body: Buffer.from('changed') })).status).toBe(200);
    expect((await readFile('test.png'))).toEqual(png);
    expect((await fetch(`${base}/internal/files/test.png`, { method: 'PUT', headers: { 'x-internal-api-key': 'upload-test-internal' }, body: png })).status).toBe(409);
  });

  it('keeps partial chunks private and reports only committed progress', async () => {
    const reservationId = (await reserve());
    const options = { reservationId, range: { start: 0, end: 7, total: 16 } };
    expect(await uploadFile('test.png', send(png.subarray(0, 8)), options)).toEqual({ size: 8, complete: false });
    expect((await fileExists('test.png'))).toBe(false);
    expect((await listFiles())).toEqual([]);
    expect(await uploadFile('test.png', send(Buffer.from('changed')), options)).toMatchObject({ conflict: true, size: 8 });
    await expect(uploadFile('test.png', send(Buffer.from('short')), { reservationId, range: { start: 8, end: 15, total: 16 } })).rejects.toThrow('length');
    expect((await state()).offset).toBe(8);
    expect(await uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).toEqual({ size: 16, complete: true });
    expect((await readFile('test.png'))).toEqual(png);
    expect(await uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).toMatchObject({ conflict: true, size: 16, complete: true });
  });

  it('rejects excess declared bytes and changes to the cumulative total before writing', async () => {
    const reservationId = (await reserve());
    await expect(uploadFile('test.png', send(png), { reservationId, contentLength: 17 })).rejects.toMatchObject({ statusCode: 413 });
    await expect(uploadFile('test.png', send(png), { reservationId, range: { start: 0, end: 7, total: 16 }, contentLength: 9 })).rejects.toThrow('Content-Length');
    await uploadFile('test.png', send(png.subarray(0, 8)), { reservationId, range: { start: 0, end: 7, total: 16 } });
    await expect(uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 14, total: 15 } })).rejects.toThrow('total');
    expect((await state()).offset).toBe(8);
  });

  it('cancels an oversized chunk before the excess buffer reaches storage', async () => {
    const reservationId = (await reserve());
    const body = new PassThrough();
    const pending = uploadFile('test.png', body, { reservationId, range: { start: 0, end: 7, total: 16 } });
    const rejected = expect(pending).rejects.toMatchObject({ statusCode: 413 });
    body.write(png.subarray(0, 8)); body.write(Buffer.alloc(1024));
    await rejected;
    expect((await state()).offset).toBe(0);
    const store = (await openUploadStore('test.png'));
    expect(fs.readdirSync(uploadLocation('test.png').directory)).toEqual([]); await store.close();
    body.destroy();
  });

  it.each(['aborted', 'error'] as const)('rolls back an interrupted request (%s)', async event => {
    const reservationId = (await reserve());
    const body = new PassThrough();
    const pending = uploadFile('test.png', body, { reservationId });
    const rejected = expect(pending).rejects.toThrow();
    body.write(png.subarray(0, 5));
    await waitForPipe(body);
    if (event === 'aborted') body.emit('aborted'); else body.emit('error', new Error('connection failed'));
    await rejected;
    expect((await fileExists('test.png'))).toBe(false);
    expect((await uploadFile('test.png', send(png), { reservationId })).complete).toBe(true);
    body.destroy();
  });

  it('rejects a request already disconnected before receiving bytes', async () => {
    const reservationId = (await reserve());
    const body = new PassThrough(); body.destroy();
    await expect(uploadFile('test.png', body, { reservationId })).rejects.toThrow('interrupted');
    expect((await state()).offset).toBe(0);
  });

  it('times out a stalled writer and releases ownership', async () => {
    const reservationId = await reserve();
    const realTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, delay?: number) => realTimeout(fn, delay === 300_000 ? 30 : delay)) as typeof setTimeout);
    const body = new PassThrough();
    await expect(uploadFile('test.png', body, { reservationId })).rejects.toMatchObject({ statusCode: 408 });
    expect((await state()).offset).toBe(0); body.destroy();
  });

  it('rejects disallowed content before publication and allows correcting the body', async () => {
    const reservationId = (await reserve());
    await expect(uploadFile('test.png', send(Buffer.from('<script>')), { reservationId })).rejects.toThrow('content');
    expect((await fileExists('test.png'))).toBe(false);
    await uploadFile('test.png', send(png), { reservationId });
    expect((await readFile('test.png'))).toEqual(png);
  });

  it('retains the old published version on interrupted internal replacement', async () => {
    await uploadFile('internal.bin', send(Buffer.from('original')), { internal: true });
    const old = (await openRead('internal.bin'));
    await expect(uploadFile('internal.bin', send(Buffer.from('short')), { internal: true, contentLength: 20 })).rejects.toThrow('length');
    expect((await readFile('internal.bin')).toString()).toBe('original');
    await uploadFile('internal.bin', send(Buffer.from('replacement')), { internal: true });
    expect(old.size).toBe(8); expect((await content(old.stream)).toString()).toBe('original');
    const fresh = (await openRead('internal.bin', () => ({ start: 1, end: 3 })));
    expect(fresh.size).toBe(11); expect((await content(fresh.stream)).toString()).toBe('epl');
  });

  it('cancels pending and completed reservations on deletion without reviving capabilities', async () => {
    const one = (await reserve('bundle/a.png')); const two = (await reserve('bundle/b.png'));
    await uploadFile('bundle/a.png', send(png), { reservationId: one });
    expect((await deleteByPrefix('bundle/'))).toBe(1);
    await expect(uploadFile('bundle/a.png', send(png), { reservationId: one })).rejects.toMatchObject({ statusCode: 403 });
    await expect(uploadFile('bundle/b.png', send(png), { reservationId: two })).rejects.toMatchObject({ statusCode: 403 });
    await expect(reserve('bundle/a.png')).rejects.toThrow('reserved');
    expect((await listFiles())).toEqual([]);
  });

  it('does not widen folder deletion to a similarly named sibling', async () => {
    const one = (await reserve('bundle/a.png')); const other = (await reserve('bundle-other/b.png'));
    await uploadFile('bundle/a.png', send(png), { reservationId: one });
    expect((await deleteByPrefix('bundle/'))).toBe(1);
    expect((await uploadFile('bundle-other/b.png', send(png), { reservationId: other })).complete).toBe(true);
    expect((await readFile('bundle-other/b.png'))).toEqual(png);
  });

  it('rejects expired/missing reservations and attempts to enlarge or replace an allowance', async () => {
    const reservationId = (await reserve());
    expect((await reserve())).toBe(reservationId);
    await expect(reserve('test.png', 15)).rejects.toThrow('reserved');
    await expect(reserve('bad.png', Number.MAX_SAFE_INTEGER)).rejects.toThrow('allowance');
    await expect(reserve('bad.png', 0)).rejects.toThrow('allowance');
    await expect(reserve('bad.png', 1.5)).rejects.toThrow('allowance');
    await expect(uploadFile('missing.png', send(png), { reservationId })).rejects.toMatchObject({ statusCode: 403 });
    const store = (await openUploadStore('test.png')); await store.save({ ...store.read()!, expiresMs: 0 }); await store.close();
    await expect(uploadFile('test.png', send(png), { reservationId })).rejects.toMatchObject({ statusCode: 403 });
    await uploadFile('legacy.png', send(png), { internal: true });
    await expect(reserve('legacy.png')).rejects.toThrow('reserved');
    fs.writeFileSync(resolvePath('old.png'), png);
    await expect(reserve('old.png')).rejects.toThrow('exists');
    (await deleteFile('legacy.png'));
    await expect(uploadFile('legacy.png', send(png), { internal: true })).rejects.toThrow('overwritten');
  });

  it('hides control state from signed paths, metadata and listing', async () => {
    (await reserve());
    expect((await listFiles())).toEqual([]);
    expect(() => resolvePath('.uploads/private.part')).toThrow('Reserved');
    expect(() => resolvePath('a/../.uploads/private.part')).toThrow('Reserved');
    await expect(openUploadStore('.')).rejects.toThrow('file path');
  });
});

describe('separate writer processes and crash recovery', () => {
  let worker: ChildProcess | undefined;
  afterEach(async () => {
    if (worker && worker.exitCode === null && worker.signalCode === null) { worker.kill('SIGKILL'); await once(worker, 'exit');
    await FileUpload.updateOne({ fileId: 'test.png' }, { $set: { leaseUntil: new Date(0) } }); }
    worker = undefined;
  });
  it('rejects another process, then recovers a killed writer without stale bytes', async () => {
    const reservationId = (await reserve());
    await uploadFile('test.png', send(png.subarray(0, 8)), { reservationId, range: { start: 0, end: 7, total: 16 } });
    const servicePath = path.resolve(__dirname, '../../services/uploadService.ts');
    worker = spawn(process.execPath, ['-r', 'ts-node/register', '-e', `
      const {PassThrough}=require('node:stream');
      const mongoose=require('mongoose');
      const {uploadFile}=require(${JSON.stringify(servicePath)});
      process.on('message',()=>{});
      const body=new PassThrough();
      mongoose.connect(process.env.TEST_MONGODB_URI).then(async()=>{
      const pending=uploadFile('test.png',body,{reservationId:${JSON.stringify(reservationId)},range:{start:8,end:15,total:16}}).catch(e=>{process.send({error:e.message});process.exitCode=1});
      body.write('junk');
      const ready=setInterval(()=>{if(body.listenerCount('aborted') > 1){clearInterval(ready);process.send({ready:true})}},10);
      await pending;
      });
    `], { env: { ...process.env, TEST_MONGODB_URI: `mongodb://${mongoose.connection.host}:${mongoose.connection.port}/${mongoose.connection.name}`, TS_NODE_PROJECT: path.resolve(__dirname, '../../../tsconfig.json') }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    const [message] = await once(worker, 'message');
    expect(message).toEqual({ ready: true });
    await expect(uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).rejects.toMatchObject({ statusCode: 409 });
    await expect(deleteFile('test.png')).rejects.toThrow('Another upload');
    worker.kill('SIGKILL'); await once(worker, 'exit');
    await FileUpload.updateOne({ fileId: 'test.png' }, { $set: { leaseUntil: new Date(0) } });
    expect((await state()).offset).toBe(8);
    expect((await uploadFile('test.png', send(png.subarray(8)), { reservationId, range: { start: 8, end: 15, total: 16 } })).complete).toBe(true);
    expect((await readFile('test.png'))).toEqual(png);
  }, 20_000);
});

describe('strict ranges and content signatures', () => {
  it.each(['bytes 0-1', 'bytes -1-1/2', 'bytes 2-1/3', 'bytes 0-2/2', 'bytes 0-9007199254740992/9007199254740993', 'items 0-1/2'])('rejects unsafe ranges: %s', value => {
    expect(() => parseContentRange(value)).toThrow('Content-Range');
  });
  it.each(['1.5', '-1', '9007199254740992', '1x'])('rejects unsafe lengths: %s', value => { expect(() => parseContentLength(value)).toThrow('Content-Length'); });
  it('accepts a bounded range and absent length', async () => {
    expect(parseContentRange('bytes 0-1/2')).toEqual({ start: 0, end: 1, total: 2 });
    expect(parseContentRange(undefined)).toBeNull(); expect(parseContentLength(undefined)).toBeUndefined(); expect(parseContentLength('2')).toBe(2);
  });
  it.each([
    ['zip', '504b0304'], ['zip', '504b0506'], ['gzip', '1f8b08'], ['png', '89504e470d0a1a0a'], ['jpeg', 'ffd8ff'],
    ['gif', Buffer.from('GIF87a').toString('hex')], ['gif', Buffer.from('GIF89a').toString('hex')],
    ['webp', Buffer.from('RIFFxxxxWEBP').toString('hex')], ['mp4', Buffer.from('xxxxftyp').toString('hex')],
    ['mov', Buffer.from('xxxxmoov').toString('hex')], ['pdf', Buffer.from('%PDF-').toString('hex')]
  ] as const)('accepts the reserved %s signature', (format, hex) => {
    const file = path.join(directory, 'candidate'); fs.writeFileSync(file, Buffer.from(hex, 'hex'));
    expect(() => validateContent(file, { format, maxBytes: 100 })).not.toThrow();
  });
  it('accepts tar headers while rejecting arbitrary bytes', async () => {
    const file = path.join(directory, 'candidate'); const tar = Buffer.alloc(512); tar.write('ustar', 257); fs.writeFileSync(file, tar);
    expect(() => validateContent(file, { format: 'tar', maxBytes: 1024 })).not.toThrow();
    fs.writeFileSync(file, 'not a tar'); expect(() => validateContent(file, { format: 'tar', maxBytes: 1024 })).toThrow('content');
  });
});
