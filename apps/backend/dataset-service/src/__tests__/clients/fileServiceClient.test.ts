import { Readable } from 'stream';
import {
  deleteFile,
  deleteFiles,
  deleteFolder,
  getDownloadUrls,
  getFileRange,
  getFileSize,
  getFileStream,
  getUploadUrl,
  putFile
} from '../../clients/fileServiceClient';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const jsonResponse = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const streamResponse = (status: number, body: string | null) =>
  ({ ok: status < 400, status, body: body === null ? null : (Readable.toWeb(Readable.from([Buffer.from(body)])) as unknown) }) as Response;
const read = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString();
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.FILE_SERVICE_URL = 'http://files.test/';
  process.env.FILE_SERVICE_API_KEY = 'api-key';
});

it('requests a long-lived zip upload URL with its byte allowance', async () => {
  fetchMock.mockResolvedValue(jsonResponse({ data: { uploadUrl: 'http://signed/put', expiresMs: 9 } }));
  expect(await getUploadUrl('datasets/d/archives/a.zip', 100)).toEqual({ url: 'http://signed/put', expiresMs: 9 });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fileId: 'datasets/d/archives/a.zip', expiresInMinutes: 240, mimetype: 'application/zip', maxBytes: 100 });
  expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/upload-url');
  fetchMock.mockResolvedValue(jsonResponse({}, 500));
  await expect(getUploadUrl('x.zip', 1)).rejects.toThrow('upload-url failed (500)');
});

it('signs many downloads in one call, and none without a call', async () => {
  const empty = await getDownloadUrls([]);
  expect(empty.urls).toEqual({});
  expect(fetchMock).not.toHaveBeenCalled();

  fetchMock.mockResolvedValue(jsonResponse({ data: { urls: { a: 'ua' }, expiresMs: 5 } }));
  expect(await getDownloadUrls(['a', 'a'], 30)).toEqual({ urls: { a: 'ua' }, expiresMs: 5 });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ fileIds: ['a'], expiresInMinutes: 30 });
  fetchMock.mockResolvedValue(jsonResponse({}, 502));
  await expect(getDownloadUrls(['a'])).rejects.toThrow('download-urls failed (502)');
});

it('stores, streams, measures, ranges and deletes files', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({}, 507));
  await putFile('a.png', Buffer.from('x'));
  await expect(putFile('a.png', Buffer.from('x'))).rejects.toThrow('put failed');

  fetchMock.mockResolvedValueOnce(streamResponse(200, 'zip bytes')).mockResolvedValueOnce(streamResponse(404, null));
  expect(await read(await getFileStream('a.zip'))).toBe('zip bytes');
  await expect(getFileStream('gone.zip')).rejects.toThrow('get failed');

  fetchMock
    .mockResolvedValueOnce(jsonResponse({ data: { size: 42 } }))
    .mockResolvedValueOnce(jsonResponse({}, 404))
    .mockResolvedValueOnce(jsonResponse({}, 500))
    .mockResolvedValueOnce(jsonResponse({ data: {} }));
  expect(await getFileSize('a.zip')).toBe(42);
  expect(await getFileSize('a.zip')).toBeNull();
  await expect(getFileSize('a.zip')).rejects.toThrow('could not report');
  await expect(getFileSize('a.zip')).rejects.toThrow('no size');

  fetchMock.mockResolvedValueOnce(streamResponse(206, 'tail')).mockResolvedValueOnce(streamResponse(200, 'everything'));
  expect(await read(await getFileRange('a.zip', 5, 8))).toBe('tail');
  expect(fetchMock.mock.calls.at(-1)[1].headers.Range).toBe('bytes=5-8');
  await expect(getFileRange('a.zip', 0, 1)).rejects.toThrow('ignored a Range');

  fetchMock.mockResolvedValueOnce(jsonResponse({}, 404)).mockResolvedValueOnce(jsonResponse({}, 500));
  await deleteFile('a.png');
  await expect(deleteFile('a.png')).rejects.toThrow('delete failed');

  fetchMock.mockResolvedValueOnce(jsonResponse({})).mockResolvedValueOnce(jsonResponse({}, 500));
  await deleteFolder('datasets/d/');
  expect(JSON.parse(fetchMock.mock.calls.at(-1)[1].body)).toEqual({ prefix: 'datasets/d/' });
  await expect(deleteFolder('datasets/d/')).rejects.toThrow('folder delete failed');
});

it('deletes named files in batches of file-service\'s limit', async () => {
  fetchMock.mockResolvedValue(jsonResponse({}));
  const fileIds = Array.from({ length: 1500 }, (_, index) => `f${index}`);
  await deleteFiles(fileIds);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toBe('http://files.test/internal/delete-files');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).fileIds).toHaveLength(500);
  fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
  await expect(deleteFiles(['a'])).rejects.toThrow('delete-files failed (500)');
});

it('prefers the internal address, when one is set, over the public one', async () => {
  process.env.FILE_SERVICE_INTERNAL_URL = 'http://file-service:5002/';
  try {
    fetchMock.mockResolvedValue(jsonResponse({ data: { uploadUrl: 'http://signed/put', expiresMs: 9 } }));
    await getUploadUrl('a.zip', 1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://file-service:5002/internal/upload-url');
  } finally {
    delete process.env.FILE_SERVICE_INTERNAL_URL;
  }
});
