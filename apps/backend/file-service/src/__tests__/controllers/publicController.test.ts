import { PassThrough } from 'stream';
import type { Request, Response } from 'express';

jest.mock('../../utils/storage', () => ({
  createWriteStream: jest.fn(),
  createReadStream: jest.fn(),
  fileExists: jest.fn(),
  getMetadata: jest.fn(),
}));
jest.mock('@visin/backend-core', () => ({
  ...jest.requireActual('@visin/backend-core'),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { uploadPublic, downloadPublic } from '../../controllers/publicController';
import * as storage from '../../utils/storage';

const mockedStorage = storage as unknown as Record<string, jest.Mock>;

type MockRes = Response & {
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
  destroy: jest.Mock;
  headersSent: boolean;
};

const makeRes = (): MockRes => {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    destroy: jest.fn(),
    headersSent: false,
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as MockRes;
};

const makeStreamReq = (fileId: string | string[]): Request & PassThrough => {
  const req = new PassThrough() as PassThrough & { params: Record<string, unknown> };
  req.params = { fileId };
  return req as unknown as Request & PassThrough;
};

const makeReq = (fileId: string | string[]): Request =>
  ({ params: { fileId } } as unknown as Request);

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadPublic', () => {
  it('stores the uploaded body and reports the byte count', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq(['grp', 'pic.jpg']);
    const res = makeRes();

    uploadPublic(req, res);
    req.end(Buffer.from('image-bytes'));
    await flush();

    expect(mockedStorage.createWriteStream).toHaveBeenCalledWith('grp/pic.jpg');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'File uploaded',
      fileId: 'grp/pic.jpg',
      size: 11,
    });
  });

  it('responds 500 when the write stream errors', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('pic.jpg');
    const res = makeRes();

    uploadPublic(req, res);
    output.emit('error', new Error('disk full'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Upload failed' });
  });

  it('stringifies non-Error failure values for logging', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('pic.jpg');
    const res = makeRes();

    uploadPublic(req, res);
    req.emit('error', 'plain string failure');
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('does not double-respond when finish fires after a failure', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('pic.jpg');
    const res = makeRes();

    uploadPublic(req, res);
    req.emit('aborted');
    output.end();
    await flush();

    expect(res.status).toHaveBeenCalledTimes(1);
  });

  it('destroys the response on abort after headers were sent', async () => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    const req = makeStreamReq('pic.jpg');
    const res = makeRes();
    res.headersSent = true;

    uploadPublic(req, res);
    req.emit('aborted');
    await flush();

    expect(res.destroy).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('downloadPublic', () => {
  const setupFile = (size = 42) => {
    mockedStorage.fileExists.mockReturnValue(true);
    mockedStorage.getMetadata.mockReturnValue({ size, lastModified: new Date() });
    const stream = new PassThrough();
    mockedStorage.createReadStream.mockReturnValue(stream);
    return stream;
  };

  it('throws NotFound when the file is missing', () => {
    mockedStorage.fileExists.mockReturnValue(false);

    expect(() => downloadPublic(makeReq('missing.jpg'), makeRes())).toThrow('File not found');
  });

  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['pic.PNG', 'image/png'],
    ['anim.gif', 'image/gif'],
    ['pic.webp', 'image/webp'],
    ['clip.mp4', 'video/mp4'],
    ['clip.mov', 'video/quicktime'],
    ['clip.avi', 'video/x-msvideo'],
    ['clip.mkv', 'video/x-matroska'],
    ['doc.pdf', 'application/pdf'],
    ['data.unknownext', 'application/octet-stream'],
    ['no-extension', 'application/octet-stream'],
  ])('serves %s with content type %s', (fileId, expectedType) => {
    setupFile();
    const res = makeRes();

    downloadPublic(makeReq(fileId), res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expectedType);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 42);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600');
  });

  it('responds 500 when the read stream errors before headers are sent', async () => {
    const stream = setupFile();
    const res = makeRes();

    downloadPublic(makeReq('photo.jpg'), res);
    stream.emit('error', new Error('io error'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Download failed' });
  });

  it('destroys the response when the stream errors mid-flight', async () => {
    const stream = setupFile();
    const res = makeRes();
    res.headersSent = true;

    downloadPublic(makeReq('photo.jpg'), res);
    const err = new Error('io error');
    stream.emit('error', err);
    await flush();

    expect(res.destroy).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
