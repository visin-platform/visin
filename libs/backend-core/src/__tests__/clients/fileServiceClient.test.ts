import { createFileServiceClient } from '../../clients/fileService';
import { BadGatewayError } from '../../errors/HttpError';

const client = createFileServiceClient();

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILE_SERVICE_URL = 'http://files.test/';
  process.env.FILE_SERVICE_API_KEY = 'api-key';
});

describe('getDownloadUrls', () => {
  it('signs many downloads in one call, asking for each file once', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { urls: { a: 'ua', b: 'ub' }, expiresMs: 5 } }));

    expect(await client.getDownloadUrls(['a', 'b', 'a'], 30)).toEqual({ urls: { a: 'ua', b: 'ub' }, expiresMs: 5 });

    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/download-urls');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'x-internal-api-key': 'api-key', 'Content-Type': 'application/json' }
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fileIds: ['a', 'b'], expiresInMinutes: 30 });
  });

  it('makes no call when there is nothing to sign', async () => {
    const { urls, expiresMs } = await client.getDownloadUrls([], 10);
    expect(urls).toEqual({});
    expect(expiresMs).toBeGreaterThan(Date.now());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a refusal as an upstream error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 502));
    const failure = await client.getDownloadUrls(['a']).catch((error) => error);
    expect(failure).toBeInstanceOf(BadGatewayError);
    expect(failure.message).toBe('file-service download-urls failed (502)');
  });
});

describe('storing and reading files', () => {
  it('writes one file through the internal route with the api key', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

    await client.putFile('label/j1/m.png', Buffer.from([1, 2, 3]));

    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/label/j1/m.png');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { 'x-internal-api-key': 'api-key' } });
    expect(Array.from(fetchMock.mock.calls[0][1].body as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('reads a whole file back', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 8]).buffer } as Response);

    expect(Array.from(await client.getFile('m.png'))).toEqual([9, 8]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/m.png');
  });

  it('reports a failed write or read as an upstream error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(client.putFile('f', Buffer.alloc(1))).rejects.toBeInstanceOf(BadGatewayError);
    await expect(client.putFile('f', Buffer.alloc(1))).rejects.toThrow('put failed for f (500)');
    await expect(client.getFile('f')).rejects.toThrow('get failed for f (500)');
  });
});

describe('deleting files', () => {
  it('removes a file, treating one already gone as removed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(client.deleteFile('gone')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });

    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(client.deleteFile('f')).rejects.toThrow('delete failed for f (500)');
  });

  it('deletes named files in batches of file-service\'s limit', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await client.deleteFiles(Array.from({ length: 2500 }, (_, index) => `f${index}`));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/delete-files');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).fileIds).toHaveLength(1000);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).fileIds).toHaveLength(500);
  });

  it('makes no call for no files, and fails the whole delete when a batch is refused', async () => {
    await client.deleteFiles([]);
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const failure = await client.deleteFiles(['a']).catch((error) => error);
    expect(failure).toBeInstanceOf(BadGatewayError);
    expect(failure.message).toBe('file-service delete-files failed (500)');
  });

  it('removes everything under a prefix with one folder delete', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
    await client.deleteFolder('label/j1/');

    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/folder');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prefix: 'label/j1/' });

    fetchMock.mockResolvedValue({ ok: false, status: 502 } as Response);
    await expect(client.deleteFolder('label/j1/')).rejects.toThrow('folder delete failed for label/j1/ (502)');
  });
});

describe('where file-service is', () => {
  afterEach(() => delete process.env.FILE_SERVICE_INTERNAL_URL);

  it('prefers the container-network address when one is set', async () => {
    process.env.FILE_SERVICE_INTERNAL_URL = 'http://file-service:5002/';
    fetchMock.mockResolvedValue(jsonResponse({}));

    await client.deleteFolder('p/');

    expect(fetchMock.mock.calls[0][0]).toBe('http://file-service:5002/internal/files/folder');
  });
});
