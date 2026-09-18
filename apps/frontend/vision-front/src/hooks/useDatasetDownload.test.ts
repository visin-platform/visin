import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const getDownloadUrl = vi.hoisted(() => vi.fn());
vi.mock('../services/datasetService', () => ({ getDownloadUrl }));

import { useDatasetDownload } from './useDatasetDownload';

describe('useDatasetDownload', () => {
  it('clicks a link to the signed URL with the zip file name', async () => {
    getDownloadUrl.mockResolvedValue({ downloadUrl: 'https://files.test/d.zip', filename: 'set.zip' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));
    await act(() => result.current.download('d1'));
    expect(click).toHaveBeenCalled();
    expect(result.current.downloadingId).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failure', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetDownload(onError));
    getDownloadUrl.mockRejectedValueOnce(new Error('no zip'));
    await act(() => result.current.download('d1'));
    getDownloadUrl.mockRejectedValueOnce('boom');
    await act(() => result.current.download('d1'));
    expect(onError.mock.calls).toEqual([['no zip'], ['Failed to download dataset']]);
  });
});
