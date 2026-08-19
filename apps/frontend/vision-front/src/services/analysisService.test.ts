import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/visionApi', () => ({
  visionApi: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
}));

import { visionApi } from '../config/visionApi';
import {
  uploadAnalysis,
  createAnalysis,
  editAnalysis,
  getAnalysisDownloadUrl,
  getAllAnalyses,
  getAnalysesByDataset,
  getAnalysisById,
  updateAnalysis,
  deleteAnalysis,
  compareAnalyses
} from './analysisService';
import { CHUNK_BYTES } from '../utils/chunkedUpload';

const mockedApi = vi.mocked(visionApi);

/**
 * Minimal XMLHttpRequest stand-in: the archive upload uses XHR (not fetch) so
 * it can report `upload.onprogress` to the progress bar.
 */
interface FakeXhr {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number }) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  status: number;
  responseText: string;
}

/** Answers every upload request with `status`, reporting `size` bytes stored. */
const stubXhr = (status = 200, size?: number): FakeXhr[] => {
  const created: FakeXhr[] = [];
  vi.stubGlobal(
    'XMLHttpRequest',
    function XMLHttpRequestStub(this: unknown) {
      const xhr: FakeXhr = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        upload: { onprogress: null },
        onload: null,
        onerror: null,
        onabort: null,
        status,
        responseText: size === undefined ? '' : JSON.stringify({ size }),
        // Reply on send, so the uploader's await resolves without the test
        // having to drive each request by hand.
        send: vi.fn(() => queueMicrotask(() => xhr.onload?.()))
      };
      created.push(xhr);
      return xhr;
    } as unknown as typeof XMLHttpRequest
  );
  return created;
};

const headerOf = (xhr: FakeXhr, name: string): string | undefined =>
  xhr.setRequestHeader.mock.calls.find((c) => c[0] === name)?.[1];


describe('analysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadAnalysis posts to /analysis/upload and returns data.data', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1', dataset: 'd' } } });
    const result = await uploadAnalysis({ foo: 'bar' });
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', { foo: 'bar' });
    expect(result).toEqual({ _id: '1', dataset: 'd' });
  });

  it('createAnalysis reserves the record, uploads, then completes it', async () => {
    mockedApi.post
      .mockResolvedValueOnce({
        data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/f.zip', analysisId: 'a1' } }
      })
      .mockResolvedValueOnce({ data: { data: { _id: 'a1' } } });
    const created = stubXhr(200, 1);

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await createAnalysis('my-dataset', file);

    // The dataset name goes up front — that reservation is what fails fast.
    expect(mockedApi.post).toHaveBeenNthCalledWith(1, '/analysis/upload-url', {
      filename: 'my-dataset.zip',
      mimetype: 'application/zip',
      dataset: 'my-dataset'
    });
    expect(created).toHaveLength(1);
    expect(created[0].open).toHaveBeenCalledWith('PUT', 'http://upload');
    // Small enough for one request, so no resumable-chunk header.
    expect(headerOf(created[0], 'Content-Range')).toBeUndefined();
    expect(mockedApi.post).toHaveBeenNthCalledWith(2, '/analysis/a1/complete');
    vi.unstubAllGlobals();
  });

  it('createAnalysis uploads nothing when the reservation is rejected', async () => {
    mockedApi.post.mockRejectedValueOnce(new Error('E11000 duplicate key error'));
    const created = stubXhr(200, 1);

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await expect(createAnalysis('my-dataset', file)).rejects.toThrow('E11000');

    expect(created).toHaveLength(0);
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('createAnalysis refuses to upload when the server reserved nothing', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/f.zip' } }
    });
    const created = stubXhr(200, 1);

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await expect(createAnalysis('my-dataset', file)).rejects.toThrow('did not reserve');
    expect(created).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it('createAnalysis chunks an archive too large for a single proxied PUT', async () => {
    mockedApi.post
      .mockResolvedValueOnce({
        data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/big.zip', analysisId: 'a1' } }
      })
      .mockResolvedValueOnce({ data: { data: { _id: '1' } } });

    const file = new File(['x'], 'big.zip', { type: 'application/zip' });
    const total = CHUNK_BYTES + 1;
    Object.defineProperty(file, 'size', { value: total });
    file.slice = vi.fn(() => new Blob(['chunk'])) as unknown as File['slice'];

    const created = stubXhr(200, total);

    await createAnalysis('big', file);

    expect(headerOf(created[0], 'Content-Range')).toBe(`bytes 0-${CHUNK_BYTES - 1}/${total}`);
    expect(mockedApi.post).toHaveBeenNthCalledWith(2, '/analysis/a1/complete');
    vi.unstubAllGlobals();
  });

  it('createAnalysis leaves fileId undefined when no file is chosen', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { _id: '1' } } });
    await createAnalysis('my-dataset');
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload', { dataset: 'my-dataset' });
  });

  it('createAnalysis leaves the reservation uncompleted when the upload fails', async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/f.zip', analysisId: 'a1' } }
    });
    stubXhr(500);

    const file = new File(['x'], 'my-dataset.zip', { type: 'application/zip' });
    await expect(createAnalysis('my-dataset', file)).rejects.toThrow('Failed to upload dataset file (500)');
    // Reservation only — never completed, so the record stays pending and hidden.
    expect(mockedApi.post).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('editAnalysis renames without touching the analysis JSON', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1' } } });
    await editAnalysis('1', 'renamed');
    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'renamed', fileId: undefined });
  });

  it('editAnalysis uploads a replacement archive and sends its fileId', async () => {
    mockedApi.post.mockResolvedValue({ data: { data: { uploadUrl: 'http://upload', fileId: 'datasets/uuid/new.zip' } } });
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1' } } });
    stubXhr(200, 1);

    await editAnalysis('1', 'renamed', new File(['x'], 'new.zip', { type: 'application/zip' }));

    // No `dataset` in the body: replacing an archive must not reserve a second record.
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/upload-url', {
      filename: 'new.zip',
      mimetype: 'application/zip'
    });
    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'renamed', fileId: 'datasets/uuid/new.zip' });
    vi.unstubAllGlobals();
  });

  it('getAnalysisDownloadUrl reads the download endpoint', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { downloadUrl: 'http://signed' } } });
    const result = await getAnalysisDownloadUrl('1');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/1/download');
    expect(result).toEqual({ downloadUrl: 'http://signed' });
  });

  it('getAllAnalyses defaults limit/skip and omits dataset when absent', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 50, skip: 0 } } });
    await getAllAnalyses();
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis', { params: { limit: 50, skip: 0 } });
  });

  it('getAllAnalyses includes dataset filter when provided', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 10, skip: 5 } } });
    await getAllAnalyses(10, 5, 'my-ds');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis', { params: { limit: 10, skip: 5, dataset: 'my-ds' } });
  });

  it('getAnalysesByDataset calls the dataset-scoped endpoint', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: [], pagination: { total: 0, limit: 50, skip: 0 } } });
    await getAnalysesByDataset('my-ds', 20, 0);
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/dataset/my-ds', { params: { limit: 20, skip: 0 } });
  });

  it('getAnalysisById returns data.data', async () => {
    mockedApi.get.mockResolvedValue({ data: { data: { _id: '1' } } });
    const result = await getAnalysisById('1');
    expect(mockedApi.get).toHaveBeenCalledWith('/analysis/1');
    expect(result).toEqual({ _id: '1' });
  });

  it('updateAnalysis puts to /analysis/:id and returns data.data', async () => {
    mockedApi.put.mockResolvedValue({ data: { data: { _id: '1', dataset: 'updated' } } });
    const result = await updateAnalysis('1', { dataset: 'updated' });
    expect(mockedApi.put).toHaveBeenCalledWith('/analysis/1', { dataset: 'updated' });
    expect(result).toEqual({ _id: '1', dataset: 'updated' });
  });

  it('deleteAnalysis calls delete on /analysis/:id', async () => {
    mockedApi.delete.mockResolvedValue({ data: { success: true } });
    await deleteAnalysis('1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/analysis/1');
  });

  it('compareAnalyses posts analysisIds and returns data', async () => {
    mockedApi.post.mockResolvedValue({ data: { success: true, data: { comparison: [], summary: { totalAnalyses: 0, datasets: [] } } } });
    const result = await compareAnalyses(['a', 'b']);
    expect(mockedApi.post).toHaveBeenCalledWith('/analysis/compare', { analysisIds: ['a', 'b'] });
    expect(result.success).toBe(true);
  });
});
