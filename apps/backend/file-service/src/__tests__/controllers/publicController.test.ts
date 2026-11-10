import { vi, type Mock } from 'vitest';
import { PassThrough } from 'stream';
import type { Request, Response } from 'express';

vi.mock('../../services/uploadService', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('../../services/uploadService')>('../../services/uploadService')),
    uploadFile: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
import { uploadFile } from '../../services/uploadService';

vi.mock('../../utils/storage', async () => {
  const module = await (() => ({
    createWriteStream: vi.fn(),
    openRead: vi.fn(),
    fileExists: vi.fn(),
    getMetadata: vi.fn()
  }))();
  return Object.assign({ default: module }, module);
});
vi.mock('@visin/backend-core', async () => {
  const module = await (async () => ({
    ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  }))();
  return Object.assign({ default: module }, module);
});

import { uploadPublic, downloadPublic } from '../../controllers/publicController';
import * as storage from '../../utils/storage';

const mockedStorage = storage as unknown as Record<string, Mock>;

type MockRes = Response & {
  status: Mock;
  json: Mock;
  setHeader: Mock;
  destroy: Mock;
  headersSent: boolean;
};

const makeRes = (): MockRes => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    destroy: vi.fn(),
    headersSent: false,
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    write: vi.fn(),
    end: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeStreamReq = (fileId: string | string[], headers: Record<string, string> = {}): Request & PassThrough => {
  const req = new PassThrough() as PassThrough & {
    params: Record<string, unknown>;
    headers: Record<string, string>;
  };
  req.params = { fileId };
  req.headers = headers;
  Object.assign(req, { query: { reservation: 'reservation' } });
  return req as unknown as Request & PassThrough;
};

const makeReq = (fileId: string | string[]): Request => ({ params: { fileId } }) as unknown as Request;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('uploadPublic', () => {
  it.each([
    [{ size: 11, complete: true }, 200, 'File uploaded'],
    [{ size: 5, complete: false }, 200, 'Chunk stored'],
    [{ size: 5, complete: false, conflict: true }, 409, 'Chunk start does not match the committed size']
  ])('returns committed progress from the service (%j)', async (result, status, message) => {
    (uploadFile as Mock).mockResolvedValue(result);
    const req = makeStreamReq(['grp', 'pic.jpg']);
    const res = makeRes();
    await uploadPublic(req, res);
    expect(uploadFile).toHaveBeenCalledWith('grp/pic.jpg', req, {
      reservationId: 'reservation',
      range: null,
      contentLength: undefined
    });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({
      success: status === 200,
      fileId: 'grp/pic.jpg',
      size: result.size,
      complete: result.complete,
      message
    });
    const finish = (res.once as Mock).mock.calls[0][1];
    finish();
    expect(req.destroyed).toBe(true);
  });
});

describe('downloadPublic', () => {
  const setupFile = (size = 42) => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.openRead.mockReturnValue({ stream, size, lastModified: new Date() });
    return stream;
  };

  it('throws NotFound when the file is missing', async () => {
    mockedStorage.fileExists.mockReturnValue(false);

    await expect(downloadPublic(makeReq('missing.jpg'), makeRes())).rejects.toThrow('File not found');
  });

  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['pic.PNG', 'image/png'],
    ['anim.gif', 'image/gif'],
    ['pic.webp', 'image/webp'],
    ['clip.mp4', 'video/mp4'],
    ['voice.m4a', 'audio/mp4'],
    ['voice.weba', 'audio/webm'],
    ['voice.ogg', 'audio/ogg'],
    ['clip.mov', 'video/quicktime'],
    ['clip.avi', 'video/x-msvideo'],
    ['clip.mkv', 'video/x-matroska'],
    ['doc.pdf', 'application/pdf'],
    ['data.unknownext', 'application/octet-stream'],
    ['no-extension', 'application/octet-stream']
  ])('serves %s with content type %s', async (fileId, expectedType) => {
    setupFile();
    const res = makeRes();

    await downloadPublic(makeReq(fileId), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expectedType);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 42);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600');
  });

  it('responds 500 when the read stream errors before headers are sent', async () => {
    const stream = setupFile();
    const res = makeRes();

    await downloadPublic(makeReq('photo.jpg'), res);
    stream.emit('error', new Error('io error'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Download failed' });
  });

  it('destroys the response when the stream errors mid-flight', async () => {
    const stream = setupFile();
    const res = makeRes();
    res.headersSent = true;

    await downloadPublic(makeReq('photo.jpg'), res);
    const err = new Error('io error');
    stream.emit('error', err);
    await flush();

    expect(res.destroy).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
