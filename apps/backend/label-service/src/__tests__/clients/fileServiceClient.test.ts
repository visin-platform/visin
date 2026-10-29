import { deleteFile, deleteFolder, getDownloadUrls, getFile, jobFolder, putFile } from '../../clients/fileServiceClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILE_SERVICE_URL = 'http://files.test/';
  process.env.FILE_SERVICE_API_KEY = 'api-key';
});

describe('getDownloadUrls', () => {
  it('signs a task\'s images in one call, asking for each file once', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { urls: { frame: 'u1', layer: 'u2' }, expiresMs: 1 } }));

    const urls = await getDownloadUrls(['frame', 'layer', 'frame'], 30);

    expect(urls).toEqual({ frame: 'u1', layer: 'u2' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/download-urls');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { 'x-internal-api-key': 'api-key', 'Content-Type': 'application/json' }
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fileIds: ['frame', 'layer'], expiresInMinutes: 30 });
  });

  it('asks for nothing when there is nothing to sign', async () => {
    expect(await getDownloadUrls([])).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a file-service failure as an upstream error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 503));
    await expect(getDownloadUrls(['frame'])).rejects.toThrow('download-urls failed (503)');
  });
});

describe('storing and reading label files', () => {
  it('writes one file through the internal route with the api key', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

    await putFile('label/j1/masks/m.png', Buffer.from([1, 2, 3]));

    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/label/j1/masks/m.png');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { 'x-internal-api-key': 'api-key' } });
    expect(Array.from(fetchMock.mock.calls[0][1].body as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('reports a failed write or read as an upstream error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(putFile('f', Buffer.alloc(1))).rejects.toThrow('put failed for f (500)');
    await expect(getFile('f')).rejects.toThrow('get failed for f (500)');
  });

  it('reads a whole file back', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 8]).buffer } as Response);

    expect(Array.from(await getFile('label/j1/masks/m.png'))).toEqual([9, 8]);
    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/label/j1/masks/m.png');
  });

  it('removes a file, treating one already gone as removed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(deleteFile('gone')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });

    fetchMock.mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(deleteFile('f')).rejects.toThrow('delete failed for f (500)');
  });

  it('removes a job\'s files with one folder delete', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);

    await deleteFolder(jobFolder('j1'));

    expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/files/folder');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ prefix: 'label/j1/' });

    fetchMock.mockResolvedValue({ ok: false, status: 502 } as Response);
    await expect(deleteFolder('label/j1/')).rejects.toThrow('folder delete failed');
  });
});
