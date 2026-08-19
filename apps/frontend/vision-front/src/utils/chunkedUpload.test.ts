import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CHUNK_BYTES, uploadFileInChunks } from './chunkedUpload';

/**
 * jsdom's File keeps the whole body in memory, so multi-chunk cases fake the
 * size rather than allocating hundreds of megabytes.
 */
const makeFile = (size: number, type = 'application/zip'): File => {
  const file = new File(['x'], 'bundle.zip', { type });
  Object.defineProperty(file, 'size', { value: size });
  file.slice = vi.fn(() => new Blob(['chunk'])) as unknown as File['slice'];
  return file;
};

const reply = (status: number, size?: number): Response =>
  ({ status, json: async () => (size === undefined ? {} : { size }) }) as Response;

const rangesOf = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
  fetchMock.mock.calls.map((call) => (call[1] as RequestInit).headers as Record<string, string>).map((h) => h['Content-Range']);

describe('uploadFileInChunks', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('sends one Content-Range chunk per CHUNK_BYTES slice, in order', async () => {
    const total = CHUNK_BYTES * 2 + 100;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, CHUNK_BYTES))
      .mockResolvedValueOnce(reply(200, CHUNK_BYTES * 2))
      .mockResolvedValueOnce(reply(200, total));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileInChunks('http://upload', makeFile(total));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rangesOf(fetchMock)).toEqual([
      `bytes 0-${CHUNK_BYTES - 1}/${total}`,
      `bytes ${CHUNK_BYTES}-${CHUNK_BYTES * 2 - 1}/${total}`,
      `bytes ${CHUNK_BYTES * 2}-${total - 1}/${total}`
    ]);
  });

  it('resumes from the offset the server reports on a 409', async () => {
    const total = CHUNK_BYTES * 2;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(409, CHUNK_BYTES))
      .mockResolvedValueOnce(reply(200, total));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileInChunks('http://upload', makeFile(total));

    expect(rangesOf(fetchMock)).toEqual([
      `bytes 0-${CHUNK_BYTES - 1}/${total}`,
      `bytes ${CHUNK_BYTES}-${total - 1}/${total}`
    ]);
  });

  it('retries a 5xx chunk and succeeds when it lands', async () => {
    const total = CHUNK_BYTES + 1;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(500))
      .mockResolvedValueOnce(reply(200, CHUNK_BYTES))
      .mockResolvedValueOnce(reply(200, total));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileInChunks('http://upload', makeFile(total))).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up immediately on a 4xx, which will never be accepted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(400)));

    await expect(uploadFileInChunks('http://upload', makeFile(CHUNK_BYTES * 2))).rejects.toThrow(
      'Failed to upload dataset file (400)'
    );
  });

  it('gives up after repeated network failures on one chunk', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileInChunks('http://upload', makeFile(CHUNK_BYTES * 2))).rejects.toThrow('network down');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('gives up when the server keeps resynchronising to a different offset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(409, 0)));

    await expect(uploadFileInChunks('http://upload', makeFile(CHUNK_BYTES * 2))).rejects.toThrow(
      'could not resynchronise with the server'
    );
  });

  it('falls back to the chunk end when the reply carries no size', async () => {
    const total = CHUNK_BYTES + 10;
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(200)).mockResolvedValueOnce(reply(200));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileInChunks('http://upload', makeFile(total));

    expect(rangesOf(fetchMock)).toEqual([
      `bytes 0-${CHUNK_BYTES - 1}/${total}`,
      `bytes ${CHUNK_BYTES}-${total - 1}/${total}`
    ]);
  });

  it('reports progress as each chunk lands', async () => {
    const total = CHUNK_BYTES * 2;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(reply(200, CHUNK_BYTES)).mockResolvedValueOnce(reply(200, total))
    );
    const onProgress = vi.fn();

    await uploadFileInChunks('http://upload', makeFile(total), onProgress);

    expect(onProgress.mock.calls).toEqual([[0.5], [1]]);
  });

  it('defaults the content type when the file has none', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, CHUNK_BYTES * 2));
    vi.stubGlobal('fetch', fetchMock);

    await uploadFileInChunks('http://upload', makeFile(CHUNK_BYTES * 2, ''));

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/octet-stream');
  });
});
