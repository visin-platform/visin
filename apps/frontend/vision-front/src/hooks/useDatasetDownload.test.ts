import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../services/analysisService', () => ({
  getAnalysisDownloadUrl: vi.fn()
}));

import { getAnalysisDownloadUrl } from '../services/analysisService';
import { useDatasetDownload } from './useDatasetDownload';

const mockedGetDownloadUrl = vi.mocked(getAnalysisDownloadUrl);

describe('useDatasetDownload', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it('resolves the download URL through the analysis endpoint', async () => {
    mockedGetDownloadUrl.mockResolvedValue({ downloadUrl: 'http://signed.example/file.zip' });
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds' } as never);
    });

    expect(mockedGetDownloadUrl).toHaveBeenCalledWith('a1');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports the error message when no download URL can be resolved', async () => {
    mockedGetDownloadUrl.mockRejectedValue(new Error('This dataset has no file to download'));
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    await act(async () => {
      await result.current.download({ _id: 'a1', dataset: 'my-ds' } as never);
    });

    expect(onError).toHaveBeenCalledWith('This dataset has no file to download');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('sets downloadingId while downloading and clears it afterwards', async () => {
    let resolveGet: (v: { downloadUrl: string }) => void = () => {};
    mockedGetDownloadUrl.mockImplementation(() => new Promise((resolve) => { resolveGet = resolve; }));
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));

    let downloadPromise!: Promise<void>;
    act(() => {
      downloadPromise = result.current.download({ _id: 'a1', dataset: 'my-ds' } as never);
    });

    await waitFor(() => expect(result.current.downloadingId).toBe('a1'));

    await act(async () => {
      resolveGet({ downloadUrl: 'http://x' });
      await downloadPromise;
    });

    expect(result.current.downloadingId).toBeNull();
  });
});
