import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../config/ConfigProvider', () => ({
  getGlobalConfig: vi.fn(() => ({ VISION_API_URL: 'http://vision-api.test' }))
}));

import { useDatasetImageExport } from './useDatasetImageExport';

describe('useDatasetImageExport', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let createObjectUrlSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('does nothing when datasetId is undefined', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageExport(undefined, onError));

    await act(async () => {
      await result.current.handleExportImages('all');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('exports "good" images with a tag query param and triggers a download', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['csv,data']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageExport('ds1', onError));

    await act(async () => {
      await result.current.handleExportImages('good');
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://vision-api.test/api/dataset-images/export-names/ds1?tag=good',
      expect.objectContaining({ method: 'GET' })
    );
    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(onError).not.toHaveBeenCalled();
  });

  it('omits the tag query param for "all"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['csv']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageExport('ds1', onError));

    await act(async () => {
      await result.current.handleExportImages('all');
    });

    expect(fetchMock).toHaveBeenCalledWith('http://vision-api.test/api/dataset-images/export-names/ds1?', expect.any(Object));
  });

  it('reports an error when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageExport('ds1', onError));

    await act(async () => {
      await result.current.handleExportImages('bad');
    });

    expect(onError).toHaveBeenCalledWith('Failed to export images');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('tracks the exporting filter while in flight and clears it afterwards', async () => {
    let resolveFetch: (v: Response) => void = () => {};
    const fetchMock = vi.fn().mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageExport('ds1', onError));

    let exportPromise!: Promise<void>;
    act(() => {
      exportPromise = result.current.handleExportImages('good');
    });

    await waitFor(() => expect(result.current.exporting).toBe('good'));

    await act(async () => {
      resolveFetch(new Response(new Blob(['x']), { status: 200 }));
      await exportPromise;
    });

    expect(result.current.exporting).toBeNull();
  });
});
