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
    deleteFile: vi.fn(),
    deleteByPrefix: vi.fn(),
    deleteFiles: vi.fn(),
    fileExists: vi.fn(),
    getMetadata: vi.fn(),
    listFiles: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn()
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

import {
  internalUpload,
  internalDownload,
  internalExists,
  internalMetadata,
  internalDelete,
  internalDeleteFolder,
  internalDeleteFiles,
  internalList
} from '../../controllers/internalController';
import * as storage from '../../utils/storage';

const mockedStorage = storage as unknown as Record<string, Mock>;

type MockRes = Response & {
  status: Mock;
  json: Mock;
  end: Mock;
  setHeader: Mock;
  destroy: Mock;
  headersSent: boolean;
};

const makeRes = (): MockRes => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    end: vi.fn(),
    setHeader: vi.fn(),
    destroy: vi.fn(),
    headersSent: false,
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
    write: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

// A request that is also a readable stream, as Express provides.
const makeStreamReq = (fileId: string | string[]): Request & PassThrough => {
  const req = new PassThrough() as PassThrough & { params: Record<string, unknown> };
  req.params = { fileId };
  Object.assign(req, { headers: {} });
  return req as unknown as Request & PassThrough;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, body: {}, query: {}, headers: {}, ...overrides }) as unknown as Request;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('internalUpload', () => {
  it('delegates streaming and reports committed size', async () => {
    (uploadFile as Mock).mockResolvedValue({ size: 11, complete: true });
    const req = makeStreamReq(['grp', 'file.bin']);
    const res = makeRes();
    await internalUpload(req, res);
    expect(uploadFile).toHaveBeenCalledWith('grp/file.bin', req, { internal: true, contentLength: undefined });
    expect(res.json).toHaveBeenCalledWith({ success: true, fileId: 'grp/file.bin', size: 11 });
    (res.once as Mock).mock.calls[0][1]();
    expect(req.destroyed).toBe(true);
  });
});

describe('internalDownload', () => {
  it('throws NotFound when the file is missing', async () => {
    mockedStorage.fileExists.mockReturnValue(false);

    await expect(internalDownload(makeReq({ params: { fileId: 'nope.bin' } }), makeRes())).rejects.toThrow(
      'File not found'
    );
  });

  it('streams the file with metadata headers', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.openRead.mockImplementation(function (_fileId, range) {
      return { stream, size: 42, range: range?.(42) ?? null };
    });
    const res = makeRes();

    await internalDownload(makeReq({ params: { fileId: ['grp', 'file.bin'] } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 42);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(mockedStorage.openRead).toHaveBeenCalledWith('grp/file.bin', expect.any(Function));
    expect(res.setHeader).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
  });

  it('serves a byte range as 206 so a zip index can be read without the whole file', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 1000, lastModified: new Date() });
    mockedStorage.openRead.mockImplementation(function (_fileId, range) {
      return { stream: new PassThrough(), size: 1000, range: range?.(1000) ?? null };
    });
    const res = makeRes();

    await internalDownload(makeReq({ params: { fileId: 'big.zip' }, headers: { range: 'bytes=900-949' } }), res);

    expect(mockedStorage.openRead.mock.results.at(-1)?.value.range).toEqual({ start: 900, end: 949 });
    expect(res.status).toHaveBeenCalledWith(206);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Range', 'bytes 900-949/1000');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 50);
  });

  it('clamps an open-ended range and falls back to the whole file on a bad one', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 1000, lastModified: new Date() });
    mockedStorage.openRead.mockImplementation(function (_fileId, range) {
      return { stream: new PassThrough(), size: 1000, range: range?.(1000) ?? null };
    });

    await internalDownload(makeReq({ params: { fileId: 'big.zip' }, headers: { range: 'bytes=990-' } }), makeRes());
    expect(mockedStorage.openRead.mock.results.at(-1)?.value.range).toEqual({ start: 990, end: 999 });

    await internalDownload(
      makeReq({ params: { fileId: 'big.zip' }, headers: { range: 'bytes=2000-3000' } }),
      makeRes()
    );
    expect(mockedStorage.openRead.mock.results.at(-1)?.value.range).toBeNull();

    await internalDownload(makeReq({ params: { fileId: 'big.zip' }, headers: { range: 'rubbish' } }), makeRes());
    expect(mockedStorage.openRead.mock.results.at(-1)?.value.range).toBeNull();
  });

  it('responds 500 when the read stream errors before headers are sent', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.openRead.mockImplementation(function (_fileId, range) {
      return { stream, size: 42, range: range?.(42) ?? null };
    });
    const res = makeRes();

    await internalDownload(makeReq({ params: { fileId: 'file.bin' } }), res);
    stream.emit('error', new Error('io error'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Download failed' });
  });

  it('destroys the response when the read stream errors mid-flight', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.openRead.mockImplementation(function (_fileId, range) {
      return { stream, size: 42, range: range?.(42) ?? null };
    });
    const res = makeRes();
    res.headersSent = true;

    await internalDownload(makeReq({ params: { fileId: 'file.bin' } }), res);
    const err = new Error('io error');
    stream.emit('error', err);
    await flush();

    expect(res.destroy).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('internalExists', () => {
  it('returns 200 when the file exists', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    const res = makeRes();

    await internalExists(makeReq({ params: { fileId: 'yes.bin' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  // Callers needing a size must use /internal/meta — this probe deliberately
  // sends no body and no Content-Length, and label-service once read it as a
  // size, which broke bundle import with an opaque 500.
  it('sends no Content-Length, so it cannot be used as a size probe', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    const res = makeRes();

    await internalExists(makeReq({ params: { fileId: 'a.zip' } }), res);

    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Length', expect.anything());
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when it does not', async () => {
    mockedStorage.fileExists.mockReturnValue(false);
    const res = makeRes();

    await internalExists(makeReq({ params: { fileId: 'no.bin' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('internalMetadata', () => {
  it('throws NotFound for a missing file', async () => {
    mockedStorage.fileExists.mockReturnValue(false);

    await expect(internalMetadata(makeReq({ params: { fileId: 'no.bin' } }), makeRes())).rejects.toThrow(
      'File not found'
    );
  });

  it('returns metadata for an existing file', async () => {
    const meta = { size: 5, lastModified: new Date() };
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue(meta);
    const res = makeRes();

    await internalMetadata(makeReq({ params: { fileId: 'yes.bin' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: meta });
  });
});

describe('internalList shallow mode', () => {
  it("passes recursive=false through, so a caller can list just a folder's own files", async () => {
    mockedStorage.listFiles.mockReturnValue([]);

    await internalList(makeReq({ query: { prefix: 'label-bundles/b1', maxKeys: 1000, recursive: false } }), makeRes());

    expect(mockedStorage.listFiles).toHaveBeenCalledWith('label-bundles/b1', 1000, false);
  });
});

describe('internalDelete', () => {
  it('deletes the file and confirms', async () => {
    const res = makeRes();

    await internalDelete(makeReq({ params: { fileId: ['grp', 'file.bin'] } }), res);

    expect(mockedStorage.deleteFile).toHaveBeenCalledWith('grp/file.bin');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'File deleted' });
  });
});

describe('internalDeleteFolder', () => {
  it('deletes by prefix and reports the count', async () => {
    mockedStorage.deleteByPrefix.mockReturnValue(3);
    const res = makeRes();

    await internalDeleteFolder(makeReq({ body: { prefix: 'grp/alb' } }), res);

    expect(mockedStorage.deleteByPrefix).toHaveBeenCalledWith('grp/alb');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Deleted 3 file(s)', count: 3 });
  });
});

describe('internalDeleteFiles', () => {
  it('deletes the named files and reports how many', async () => {
    const res = makeRes();
    await internalDeleteFiles(makeReq({ body: { fileIds: ['a.png', 'b.png'] } }), res);
    expect(mockedStorage.deleteFiles).toHaveBeenCalledWith(['a.png', 'b.png']);
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Deleted 2 file(s)', count: 2 });
  });
});

describe('internalList', () => {
  it('lists files under a prefix', async () => {
    const files = [{ name: 'a.txt', size: 1 }];
    mockedStorage.listFiles.mockReturnValue(files);
    const res = makeRes();

    await internalList(makeReq({ query: { prefix: 'grp', maxKeys: 10, recursive: true } }), res);

    expect(mockedStorage.listFiles).toHaveBeenCalledWith('grp', 10, true);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: files });
  });
});
