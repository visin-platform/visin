import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../services/datasetService', () => ({
  datasetService: {
    getSignedUrl: vi.fn(),
    getDatasets: vi.fn(),
    downloadDataset: vi.fn()
  }
}));

import { datasetService } from '../services/datasetService';
import { useDatasetDownload } from './useDatasetDownload';

const mockedService = vi.mocked(datasetService);

describe('useDatasetDownload', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('downloads directly using an absolute downloadUrl', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds', downloadUrl: 'http://direct.example/file.zip' } as any);
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mockedService.getSignedUrl).not.toHaveBeenCalled();
  });

  it('resolves a datasets/-prefixed downloadUrl through getSignedUrl', async () => {
    mockedService.getSignedUrl.mockResolvedValue({ signedUrl: 'http://signed.example/file.zip', expiresAt: 'later' });
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds', downloadUrl: 'datasets/my-ds.zip' } as any);
    });

    expect(mockedService.getSignedUrl).toHaveBeenCalledWith('datasets/my-ds.zip');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error when getSignedUrl fails for a storage path', async () => {
    mockedService.getSignedUrl.mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds', downloadUrl: 'datasets/my-ds.zip' } as any);
    });

    expect(onError).toHaveBeenCalledWith('Failed to generate download URL for storage path');
  });

  it('falls back to a dataset lookup when there is no downloadUrl', async () => {
    mockedService.getDatasets.mockResolvedValue({
      success: true,
      data: { datasets: [{ name: 'my-ds', uuid: 'uuid-1' }] as any, pagination: {} as any }
    });
    mockedService.downloadDataset.mockResolvedValue({ downloadUrl: 'http://fallback.example/file.zip' });
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds' } as any);
    });

    expect(mockedService.getDatasets).toHaveBeenCalledWith({ search: 'my-ds', limit: 1 });
    expect(mockedService.downloadDataset).toHaveBeenCalledWith('uuid-1');
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('errors when the fallback dataset lookup finds no matching dataset', async () => {
    mockedService.getDatasets.mockResolvedValue({ success: true, data: { datasets: [], pagination: {} as any } });
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'missing-ds' } as any);
    });

    expect(onError).toHaveBeenCalledWith('Dataset not found or missing UUID');
    expect(mockedService.downloadDataset).not.toHaveBeenCalled();
  });

  it('errors when the fallback download has no downloadUrl', async () => {
    mockedService.getDatasets.mockResolvedValue({
      success: true,
      data: { datasets: [{ name: 'my-ds', uuid: 'uuid-1' }] as any, pagination: {} as any }
    });
    mockedService.downloadDataset.mockResolvedValue({ downloadUrl: '' });
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds' } as any);
    });

    expect(onError).toHaveBeenCalledWith('No download URL available');
  });

  it('sets downloadingId while downloading and clears it afterwards', async () => {
    let resolveGet: (v: any) => void = () => {};
    mockedService.getSignedUrl.mockImplementation(() => new Promise((resolve) => { resolveGet = resolve; }));
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.download({ _id: 'a1', dataset: 'my-ds', downloadUrl: 'datasets/my-ds.zip' } as any);
    });

    await waitFor(() => expect(result.current.downloadingId).toBe('a1'));

    await act(async () => {
      resolveGet({ signedUrl: 'http://x', expiresAt: 'later' });
      await downloadPromise;
    });

    expect(result.current.downloadingId).toBeNull();
  });
});
