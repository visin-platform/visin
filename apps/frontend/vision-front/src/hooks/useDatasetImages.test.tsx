import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/datasetImageService', () => ({
  getImagesByDataset: vi.fn()
}));

import { getImagesByDataset } from '../services/datasetImageService';
import { useDatasetImages } from './useDatasetImages';

const mockedGet = vi.mocked(getImagesByDataset);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useDatasetImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGet.mockResolvedValue({
      success: true,
      data: { images: [{ _id: 'img1' }] as any, pagination: { page: 1, limit: 50, total: 1, pages: 1 } }
    });
  });

  it('fetches the first page with default filters', async () => {
    const { result } = renderHook(() => useDatasetImages({ datasetId: 'ds1' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedGet).toHaveBeenCalledWith('ds1', 1, 50, undefined, undefined, undefined, undefined, 'updatedAt', 'desc');
    expect(result.current.data?.data.images).toHaveLength(1);
  });

  it('does not fetch when datasetId is empty', () => {
    renderHook(() => useDatasetImages({ datasetId: '' }), { wrapper: makeWrapper() });
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('updateFilter resets to page 1 and passes the filter through', async () => {
    const { result } = renderHook(() => useDatasetImages({ datasetId: 'ds1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.setPage(3);
    });
    await waitFor(() => expect(result.current.page).toBe(3));

    act(() => {
      result.current.updateFilter('category', 'cat1');
    });

    expect(result.current.page).toBe(1);
    expect(result.current.filters.category).toBe('cat1');

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('ds1', 1, 50, undefined, 'cat1', undefined, undefined, 'updatedAt', 'desc')
    );
  });

  it('joins multiple tags with a space when passed to the query', async () => {
    const { result } = renderHook(() => useDatasetImages({ datasetId: 'ds1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.updateFilter('tags', ['a', 'b']);
    });

    await waitFor(() =>
      expect(mockedGet).toHaveBeenCalledWith('ds1', 1, 50, undefined, undefined, 'a b', undefined, 'updatedAt', 'desc')
    );
  });
});
