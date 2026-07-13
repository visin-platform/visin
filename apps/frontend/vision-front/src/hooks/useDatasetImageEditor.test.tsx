import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/datasetImageService', () => ({
  updateDatasetImage: vi.fn()
}));

import { updateDatasetImage } from '../services/datasetImageService';
import { useDatasetImageEditor } from './useDatasetImageEditor';

const mockedUpdate = vi.mocked(updateDatasetImage);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const makeImage = (overrides: Record<string, unknown> = {}) =>
  ({
    _id: 'img1',
    categoryId: 'cat1',
    tags: ['good', 'sunny'],
    weatherCondition: 'day_fair',
    ...overrides
  } as any);

describe('useDatasetImageEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the edit modal prefilled with the image data', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditImageCategory(makeImage());
    });

    expect(result.current.editImageModalOpen).toBe(true);
    expect(result.current.selectedCategoryForEdit).toBe('cat1');
    expect(result.current.selectedTagsForEdit).toBe('good, sunny');
    expect(result.current.selectedWeatherForEdit).toBe('day_fair');
  });

  it('saves the edited image, splitting and trimming the comma-separated tags', async () => {
    mockedUpdate.mockResolvedValue({} as any);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditImageCategory(makeImage());
    });
    act(() => {
      result.current.setSelectedTagsForEdit('good,  bad ,, sunny');
      result.current.setSelectedCategoryForEdit('cat2');
      result.current.setSelectedWeatherForEdit('snow');
    });

    await act(async () => {
      await result.current.handleSaveImageCategory();
    });

    expect(mockedUpdate).toHaveBeenCalledWith('img1', {
      categoryId: 'cat2',
      tags: ['good', 'bad', 'sunny'],
      weatherCondition: 'snow'
    });
    expect(onSuccess).toHaveBeenCalledWith('Image updated successfully');
    expect(result.current.editImageModalOpen).toBe(false);
    expect(result.current.editingImage).toBeNull();
  });

  it('sends undefined for categoryId/weatherCondition when cleared', async () => {
    mockedUpdate.mockResolvedValue({} as any);
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditImageCategory(makeImage({ categoryId: '', weatherCondition: undefined, tags: [] }));
    });

    await act(async () => {
      await result.current.handleSaveImageCategory();
    });

    expect(mockedUpdate).toHaveBeenCalledWith('img1', {
      categoryId: undefined,
      tags: [],
      weatherCondition: undefined
    });
  });

  it('reports an error and keeps the modal open when the update fails', async () => {
    mockedUpdate.mockRejectedValue(new Error('boom'));
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditImageCategory(makeImage());
    });

    await act(async () => {
      await result.current.handleSaveImageCategory();
    });

    expect(onError).toHaveBeenCalledWith('Failed to update image');
    expect(result.current.editImageModalOpen).toBe(true);
  });

  it('does nothing when saving without an editing image selected', async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleSaveImageCategory();
    });

    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('closeEditImageModal resets state', () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDatasetImageEditor('ds1', onSuccess, onError), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditImageCategory(makeImage());
    });
    act(() => {
      result.current.closeEditImageModal();
    });

    expect(result.current.editImageModalOpen).toBe(false);
    expect(result.current.editingImage).toBeNull();
  });
});
