import { PassThrough } from 'stream';
import type { Request, Response } from 'express';

jest.mock('../../services/uploadService', () => ({ ...jest.requireActual('../../services/uploadService'), uploadFile: jest.fn() }));
import { uploadFile } from '../../services/uploadService';

jest.mock('../../utils/storage', () => ({
  createWriteStream: jest.fn(),
  createWriteStreamAt: jest.fn(),
  openRead: jest.fn(),
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
  Object.assign(req, { query: { reservation: 'reservation' } });
  return req as unknown as Request & PassThrough;
};

const makeReq = (fileId: string | string[]): Request =>
  ({ params: { fileId } } as unknown as Request);

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('uploadPublic', () => {
  it.each([
    [{ size: 11, complete: true }, 200, 'File uploaded'],
    [{ size: 5, complete: false }, 200, 'Chunk stored'],
    [{ size: 5, complete: false, conflict: true }, 409, 'Chunk start does not match the committed size']
  ])('returns committed progress from the service (%j)', async (result, status, message) => {
    (uploadFile as jest.Mock).mockResolvedValue(result);
    const req = makeStreamReq(['grp', 'pic.jpg']);
    const res = makeRes();
    await uploadPublic(req, res);
    expect(uploadFile).toHaveBeenCalledWith('grp/pic.jpg', req, { reservationId: 'reservation', range: null, contentLength: undefined });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ success: status === 200, fileId: 'grp/pic.jpg', size: result.size, complete: result.complete, message });
    const finish = (res.once as jest.Mock).mock.calls[0][1];
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
    ['clip.mov', 'video/quicktime'],
    ['clip.avi', 'video/x-msvideo'],
    ['clip.mkv', 'video/x-matroska'],
    ['doc.pdf', 'application/pdf'],
    ['data.unknownext', 'application/octet-stream'],
    ['no-extension', 'application/octet-stream'],
  ])('serves %s with content type %s', async (fileId, expectedType) => {
    setupFile();
    const res = makeRes();

    (await downloadPublic(makeReq(fileId), res));

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expectedType);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 42);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=3600');
  });

  it('responds 500 when the read stream errors before headers are sent', async () => {
    const stream = setupFile();
    const res = makeRes();

    (await downloadPublic(makeReq('photo.jpg'), res));
    stream.emit('error', new Error('io error'));
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Download failed' });
  });

  it('destroys the response when the stream errors mid-flight', async () => {
    const stream = setupFile();
    const res = makeRes();
    res.headersSent = true;

    (await downloadPublic(makeReq('photo.jpg'), res));
    const err = new Error('io error');
    stream.emit('error', err);
    await flush();

    expect(res.destroy).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
