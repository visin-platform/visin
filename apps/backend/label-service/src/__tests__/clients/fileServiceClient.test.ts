import { Readable } from 'stream';
import {
  getUploadUrl,
  getDownloadUrl,
  putFile,
  getFileStream,
  getFileSize,
  getFileRange,
  fileExists,
  deleteFolder,
} from '../../clients/fileServiceClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILE_SERVICE_URL = 'http://files.test';
  process.env.FILE_SERVICE_API_KEY = 'api-key';
});

describe('signed URLs', () => {
  it('requests an upload URL with mimetype + expiry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { uploadUrl: 'http://signed/put', expiresMs: 123 } }));

    const signed = await getUploadUrl('label-bundles/b1/upload-1.zip');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://files.test/internal/upload-url',
      expect.objectContaining({
        method: 'POST',
        headers: { 'x-internal-api-key': 'api-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: 'label-bundles/b1/upload-1.zip',
          expiresInMinutes: 240,
          mimetype: 'application/zip',
        }),
      })
    );
    expect(signed).toEqual({ url: 'http://signed/put', fileId: 'label-bundles/b1/upload-1.zip', expiresMs: 123 });
  });

  it('requests a download URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { downloadUrl: 'http://signed/get', expiresMs: 9 } }));

    const signed = await getDownloadUrl('f1', 30);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://files.test/internal/download-url',
      expect.objectContaining({ body: JSON.stringify({ fileId: 'f1', expiresInMinutes: 30 }) })
    );
    expect(signed.url).toBe('http://signed/get');
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(getDownloadUrl('f1')).rejects.toThrow('download-url failed (500)');
  });
});

describe('putFile', () => {
  it('PUTs raw bytes to the internal files route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await putFile('a/b.png', Buffer.from('data'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://files.test/internal/files/a/b.png');
    expect(init.method).toBe('PUT');
    expect(Buffer.from(init.body)).toEqual(Buffer.from('data'));
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(putFile('a/b.png', Buffer.from('x'))).rejects.toThrow('put failed');
  });
});

describe('ranged reads', () => {
  // Shape is file-service's `internalMetadata` response, verbatim. HEAD on
  // /internal/files/* is an existence probe with no Content-Length, so asking
  // it for a size silently yielded nothing and 500'd the whole preview.
  it('reads the size from the metadata endpoint', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: true, data: { size: 731000000, lastModified: new Date().toISOString() } })
    );

    await expect(getFileSize('big.zip')).resolves.toBe(731000000);
    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/meta/big.zip');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined(); // GET, not HEAD
  });

  it('reports a 502 when file-service cannot give a usable size', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: {} }));
    await expect(getFileSize('big.zip')).rejects.toMatchObject({ statusCode: 502, message: /no size/ });

    fetchMock.mockResolvedValue(jsonResponse({ success: false }, 404));
    await expect(getFileSize('big.zip')).rejects.toMatchObject({ statusCode: 502 });
  });

  it('asks for the byte range and streams the 206 body', async () => {
    const webStream = Readable.toWeb(Readable.from([Buffer.from('tail')]));
    fetchMock.mockResolvedValue({ ok: true, status: 206, body: webStream } as unknown as Response);

    const stream = await getFileRange('big.zip', 900, 949);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString()).toBe('tail');
    expect(fetchMock.mock.calls[0][1].headers.Range).toBe('bytes=900-949');
  });

  it('refuses a server that ignores Range rather than streaming the whole file', async () => {
    const webStream = Readable.toWeb(Readable.from([Buffer.from('everything')]));
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: webStream } as unknown as Response);

    // 502, not 500: an un-redeployed file-service is a version skew, and the
    // message has to say so or the UI shows a bare "Something went wrong".
    await expect(getFileRange('big.zip', 0, 10)).rejects.toMatchObject({
      statusCode: 502,
      message: /ignored a Range request/,
    });
  });
});

describe('getFileStream', () => {
  it('returns a node stream of the response body', async () => {
    const webStream = Readable.toWeb(Readable.from([Buffer.from('zip-bytes')]));
    fetchMock.mockResolvedValue({ ok: true, status: 200, body: webStream } as unknown as Response);

    const stream = await getFileStream('a.zip');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    expect(Buffer.concat(chunks).toString()).toBe('zip-bytes');
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, body: null } as unknown as Response);

    await expect(getFileStream('a.zip')).rejects.toThrow('get failed');
  });
});

describe('fileExists', () => {
  it('is true for 200 and false for 404', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    expect(await fileExists('a.zip')).toBe(true);

    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    expect(await fileExists('a.zip')).toBe(false);
  });
});

describe('request deadlines', () => {
  it('gives every outbound call an abort signal, so a stalled file-service cannot hang the caller', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { downloadUrl: 'http://signed/get', expiresMs: 1 } }));

    await getDownloadUrl('f1');
    await fileExists('f1');

    for (const [, init] of fetchMock.mock.calls) {
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

describe('deleteFolder', () => {
  it('DELETEs by prefix', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));

    await deleteFolder('label-bundles/b1/');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://files.test/internal/files/folder',
      expect.objectContaining({
        method: 'DELETE',
        headers: { 'x-internal-api-key': 'api-key', 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'label-bundles/b1/' }),
      })
    );
  });

  it('throws on failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(deleteFolder('label-bundles/b1/')).rejects.toThrow('folder delete failed');
  });
});
