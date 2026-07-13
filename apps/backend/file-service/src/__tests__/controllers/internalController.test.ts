import { PassThrough } from 'stream';
import type { Request, Response } from 'express';

jest.mock('../../utils/storage', () => ({
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
  deleteFile: jest.fn(),
  deleteByPrefix: jest.fn(),
  fileExists: jest.fn(),
  getMetadata: jest.fn(),
  listFiles: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
  internalUpload,
  internalDownload,
  internalExists,
  internalMetadata,
  internalDelete,
  internalDeleteFolder,
  internalList,
} from '../../controllers/internalController';
import * as storage from '../../utils/storage';

const mockedStorage = storage as unknown as Record<string, jest.Mock>;

type MockRes = Response & {
  status: jest.Mock;
  json: jest.Mock;
  end: jest.Mock;
  setHeader: jest.Mock;
  destroy: jest.Mock;
  headersSent: boolean;
};

const makeRes = (): MockRes => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
    setHeader: jest.fn(),
    destroy: jest.fn(),
    headersSent: false,
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    write: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

// A request that is also a readable stream, as Express provides.
const makeStreamReq = (fileId: string | string[]): Request & PassThrough => {
  const req = new PassThrough() as PassThrough & { params: Record<string, unknown> };
  req.params = { fileId };
  return req as unknown as Request & PassThrough;
};

const makeReq = (overrides: Record<string, unknown> = {}): Request =>
  ({ params: {}, body: {}, query: {}, ...overrides } as unknown as Request);

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('internalUpload', () => {
  it('pipes the request body to storage and reports the size', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq(['grp', 'file.bin']);
    const res = makeRes();

    internalUpload(req, res);
    req.end(Buffer.from('hello world'));
    await flush();

    expect(mockedStorage.createWriteStream).toHaveBeenCalledWith('grp/file.bin');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, fileId: 'grp/file.bin', size: 11 });
  });

  it('responds 500 when the write stream errors before headers are sent', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();

    internalUpload(req, res);
    output.emit('error', new Error('disk full'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Upload failed' });
  });

  it('destroys the response when the stream errors after headers were sent', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();
    res.headersSent = true;

    internalUpload(req, res);
    req.emit('error', new Error('conn reset'));
    await flush();

    expect(res.destroy).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 500 when the client aborts', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();

    internalUpload(req, res);
    req.emit('aborted');
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('responds only once when multiple failure events fire', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();

    internalUpload(req, res);
    req.emit('aborted');
    output.emit('error', new Error('late error'));
    await flush();

    expect(res.status).toHaveBeenCalledTimes(1);
  });

  it('stringifies non-Error failure values for logging', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();

    internalUpload(req, res);
    req.emit('error', 'plain string failure');
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not double-respond when finish fires after a failure', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('file.bin');
    const res = makeRes();

    internalUpload(req, res);
    req.emit('aborted');
    output.end(); // triggers 'finish' after the failure already responded
    await flush();

    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('internalDownload', () => {
  it('throws NotFound when the file is missing', () => {
    mockedStorage.fileExists.mockReturnValue(false);

    expect(() => internalDownload(makeReq({ params: { fileId: 'nope.bin' } }), makeRes())).toThrow(
      'File not found'
    );
  });

  it('streams the file with metadata headers', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.createReadStream.mockReturnValue(stream);
    const res = makeRes();

    internalDownload(makeReq({ params: { fileId: ['grp', 'file.bin'] } }), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 42);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    expect(mockedStorage.createReadStream).toHaveBeenCalledWith('grp/file.bin');
  });

  it('responds 500 when the read stream errors before headers are sent', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.createReadStream.mockReturnValue(stream);
    const res = makeRes();

    internalDownload(makeReq({ params: { fileId: 'file.bin' } }), res);
    stream.emit('error', new Error('io error'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Download failed' });
  });

  it('destroys the response when the read stream errors mid-flight', async () => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size: 42, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.createReadStream.mockReturnValue(stream);
    const res = makeRes();
    res.headersSent = true;

    internalDownload(makeReq({ params: { fileId: 'file.bin' } }), res);
    const err = new Error('io error');
    stream.emit('error', err);
    await flush();

    expect(res.destroy).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('internalExists', () => {
  it('returns 200 when the file exists', () => {
    mockedStorage.fileExists.mockReturnValue(true);
    const res = makeRes();

    internalExists(makeReq({ params: { fileId: 'yes.bin' } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 404 when it does not', () => {
    mockedStorage.fileExists.mockReturnValue(false);
    const res = makeRes();

    internalExists(makeReq({ params: { fileId: 'no.bin' } }), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('internalMetadata', () => {
  it('throws NotFound for a missing file', () => {
    mockedStorage.fileExists.mockReturnValue(false);

    expect(() => internalMetadata(makeReq({ params: { fileId: 'no.bin' } }), makeRes())).toThrow(
      'File not found'
    );
  });

  it('returns metadata for an existing file', () => {
    const meta = { size: 5, lastModified: new Date() };
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue(meta);
    const res = makeRes();

    internalMetadata(makeReq({ params: { fileId: 'yes.bin' } }), res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: meta });
  });
});

describe('internalDelete', () => {
  it('deletes the file and confirms', () => {
    const res = makeRes();

    internalDelete(makeReq({ params: { fileId: ['grp', 'file.bin'] } }), res);

    expect(mockedStorage.deleteFile).toHaveBeenCalledWith('grp/file.bin');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'File deleted' });
  });
});

describe('internalDeleteFolder', () => {
  it('deletes by prefix and reports the count', () => {
    mockedStorage.deleteByPrefix.mockReturnValue(3);
    const res = makeRes();

    internalDeleteFolder(makeReq({ body: { prefix: 'grp/alb' } }), res);

    expect(mockedStorage.deleteByPrefix).toHaveBeenCalledWith('grp/alb');
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Deleted 3 file(s)', count: 3 });
  });
});

describe('internalList', () => {
  it('lists files under a prefix', () => {
    const files = [{ name: 'a.txt', size: 1 }];
    mockedStorage.listFiles.mockReturnValue(files);
    const res = makeRes();

    internalList(makeReq({ query: { prefix: 'grp', maxKeys: 10 } }), res);

    expect(mockedStorage.listFiles).toHaveBeenCalledWith('grp', 10);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: files });
  });
});
