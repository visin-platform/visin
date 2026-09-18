import { getDownloadUrls } from '../../clients/fileServiceClient';

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

it('prefers the internal address, when one is set, over the public one', async () => {
  process.env.FILE_SERVICE_INTERNAL_URL = 'http://file-service:5002/';
  try {
    fetchMock.mockResolvedValue(jsonResponse({ data: { urls: { a: 'u' }, expiresMs: 1 } }));
    await getDownloadUrls(['a']);
    expect(fetchMock.mock.calls[0][0]).toBe('http://file-service:5002/internal/download-urls');
  } finally {
    delete process.env.FILE_SERVICE_INTERNAL_URL;
  }
});
