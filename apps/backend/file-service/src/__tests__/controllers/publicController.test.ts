import { PassThrough } from 'stream';
import type { Request, Response } from 'express';

jest.mock('../../utils/storage', () => ({
  createWriteStream: jest.fn(),
  createWriteStreamAt: jest.fn(),
  createReadStream: jest.fn(),
  fileExists: jest.fn(),
  getMetadata: jest.fn(),
  truncateFile: jest.fn(),
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

const makeStreamReq = (
  fileId: string | string[],
  headers: Record<string, string> = {}
): Request & PassThrough => {
  const req = new PassThrough() as PassThrough & {
    params: Record<string, unknown>;
    headers: Record<string, string>;
  };
  req.params = { fileId };
  req.headers = headers;
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

describe('uploadPublic — chunked (Content-Range)', () => {
  const chunked = (range: string, storedBytes?: number) => {
    const output = new PassThrough();
    mockedStorage.createWriteStream.mockReturnValue(output);
    mockedStorage.createWriteStreamAt.mockReturnValue(output);
    mockedStorage.fileExists.mockReturnValue(storedBytes !== undefined);
    if (storedBytes !== undefined) {
      mockedStorage.getMetadata.mockReturnValue({ size: storedBytes, lastModified: new Date() });
    }
    return { output, req: makeStreamReq('bundle/zip', { 'content-range': range }), res: makeRes() };
  };

  it('stores a first chunk with the truncating stream and reports it incomplete', async () => {
    const { req, res } = chunked('bytes 0-4/11');

    uploadPublic(req, res);
    req.end(Buffer.from('image'));
    await flush();

    expect(mockedStorage.createWriteStream).toHaveBeenCalledWith('bundle/zip');
    expect(mockedStorage.createWriteStreamAt).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Chunk stored',
      fileId: 'bundle/zip',
      size: 5,
      complete: false,
    });
  });

  it('writes a later chunk at its own offset and reports completion on the last one', async () => {
    const { req, res } = chunked('bytes 5-10/11', 5);

    uploadPublic(req, res);
    req.end(Buffer.from('-bytes'));
    await flush();

    expect(mockedStorage.createWriteStreamAt).toHaveBeenCalledWith('bundle/zip', 5);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'File uploaded',
      fileId: 'bundle/zip',
      size: 11,
      complete: true,
    });
  });

  it('answers 409 with the stored size when the chunk starts at the wrong offset', () => {
    const { req, res } = chunked('bytes 10-14/20', 5);

    uploadPublic(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Chunk start does not match the stored size',
      fileId: 'bundle/zip',
      size: 5,
    });
    expect(mockedStorage.createWriteStreamAt).not.toHaveBeenCalled();
  });

  it('rolls the file back to the chunk start when the body length disagrees', async () => {
    const { req, res } = chunked('bytes 5-10/11', 5);

    uploadPublic(req, res);
    req.end(Buffer.from('short'));
    await flush();

    expect(mockedStorage.truncateFile).toHaveBeenCalledWith('bundle/zip', 5);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Chunk length does not match Content-Range',
      fileId: 'bundle/zip',
      size: 5,
    });
  });

  it.each([
    ['bytes 0-4', 'no total'],
    ['0-4/11', 'no unit'],
    ['bytes 4-2/11', 'end before start'],
    ['bytes 0-11/11', 'end past total'],
    ['items 0-4/11', 'wrong unit'],
  ])('rejects %s (%s) before writing anything', (header) => {
    const { req, res } = chunked(header);

    expect(() => uploadPublic(req, res)).toThrow(/Content-Range/);
    expect(mockedStorage.createWriteStream).not.toHaveBeenCalled();
    expect(mockedStorage.createWriteStreamAt).not.toHaveBeenCalled();
  });

  it('destroys the write stream when a chunk aborts mid-flight', async () => {
    const { output, req, res } = chunked('bytes 5-10/11', 5);
    const destroy = jest.spyOn(output, 'destroy');

    uploadPublic(req, res);
    req.emit('aborted');
    await flush();

    expect(destroy).toHaveBeenCalled();
    // No rollback: bytes already written are a valid prefix, so the client
    // resumes from whatever the next 409 reports rather than re-sending more.
    expect(mockedStorage.truncateFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
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
