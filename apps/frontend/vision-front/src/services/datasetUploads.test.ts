import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';

const uploadArchive = vi.hoisted(() => vi.fn());
vi.mock('./datasetService', () => ({ uploadArchive }));

import { UploadCancelledError } from '../utils/chunkedUpload';
import {
  cancelUpload,
  dismissUpload,
  DONE_VISIBLE_MS,
  resetDatasetUploads,
  retryUpload,
  startUpload,
  useDatasetUpload,
  useDatasetUploads
} from './datasetUploads';

const file = new File(['zip'], 'set.zip');
const dataset = { _id: 'd1', name: 'Set' };

describe('dataset uploads', () => {
  let client: QueryClient;
  beforeEach(() => {
    vi.useFakeTimers();
    resetDatasetUploads();
    uploadArchive.mockReset();
    client = new QueryClient();
  });
  afterEach(() => vi.useRealTimers());

  it('reports progress, hands the finished dataset to the cache, then clears itself', async () => {
    let finish!: (value: unknown) => void;
    uploadArchive.mockImplementation((_id: string, _file: File, onProgress: (n: number) => void) => {
      onProgress(0.4);
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const { result } = renderHook(() => useDatasetUpload('d1'));
    act(() => startUpload(dataset, file, client));
    expect(result.current).toMatchObject({ status: 'uploading', progress: 0.4, filename: 'set.zip', datasetName: 'Set' });
    expect(() => startUpload(dataset, file, client)).toThrow('already uploading');

    await act(async () => finish({ _id: 'd1', name: 'Set', scan: { status: 'queued' } }));
    expect(result.current?.status).toBe('done');
    expect(client.getQueryData(['dataset', 'd1'])).toMatchObject({ scan: { status: 'queued' } });

    act(() => vi.advanceTimersByTime(DONE_VISIBLE_MS));
    expect(result.current).toBeUndefined();
  });

  it('marks the last bytes as finishing, and keeps a failure until dismissed', async () => {
    uploadArchive.mockImplementation(async (_id: string, _file: File, onProgress: (n: number) => void) => {
      onProgress(1);
      throw new Error('Failed to upload dataset file (500)');
    });
    const { result } = renderHook(() => useDatasetUploads());
    await act(async () => startUpload(dataset, file, client));
    expect(result.current).toEqual([expect.objectContaining({ status: 'failed', error: 'Failed to upload dataset file (500)', progress: 1 })]);
    act(() => dismissUpload('d1'));
    expect(result.current).toEqual([]);
  });

  it('cancels, then resumes with the file still in hand', async () => {
    uploadArchive.mockImplementationOnce(
      (_id: string, _file: File, _onProgress: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new UploadCancelledError())))
    );
    const { result } = renderHook(() => useDatasetUpload('d1'));
    act(() => startUpload(dataset, file, client));
    act(() => dismissUpload('d1'));
    expect(result.current?.status).toBe('uploading');
    await act(async () => cancelUpload('d1'));
    expect(result.current?.status).toBe('cancelled');

    uploadArchive.mockResolvedValueOnce({ _id: 'd1' });
    await act(async () => retryUpload('d1'));
    expect(uploadArchive).toHaveBeenLastCalledWith('d1', file, expect.any(Function), expect.any(AbortSignal));
    expect(result.current?.status).toBe('done');
    act(() => retryUpload('d1'));
    retryUpload('missing');
    expect(uploadArchive).toHaveBeenCalledTimes(2);
  });
});
