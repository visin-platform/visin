import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/imageCategoryService', () => ({
  createImageCategory: vi.fn(),
  updateImageCategory: vi.fn(),
  deleteImageCategory: vi.fn()
}));

import { createImageCategory, updateImageCategory, deleteImageCategory } from '../services/imageCategoryService';
import { useDatasetCategoryManager } from './useDatasetCategoryManager';

const mockedCreate = vi.mocked(createImageCategory);
const mockedUpdate = vi.mocked(updateImageCategory);
const mockedDelete = vi.mocked(deleteImageCategory);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useDatasetCategoryManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a validation alert and skips the API call when the name is blank', async () => {
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleSaveCategory();
    });

    expect(result.current.categoryAlert).toEqual({ type: 'error', message: 'Category name is required' });
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('creates a category and closes the modal on success', async () => {
    mockedCreate.mockResolvedValue({ _id: 'c1' } as any);
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    act(() => {
      result.current.setCategoryForm({ name: 'New Cat', description: 'desc', color: '#fff' });
    });

    await act(async () => {
      await result.current.handleSaveCategory();
    });

    expect(mockedCreate).toHaveBeenCalledWith({ name: 'New Cat', description: 'desc', datasetId: 'ds1', color: '#fff' });
    expect(result.current.categoryModalOpen).toBe(false);
    expect(result.current.categoryAlert).toEqual({ type: 'success', message: 'Category created successfully' });
  });

  it('updates an existing category when editingCategory is set', async () => {
    mockedUpdate.mockResolvedValue({ _id: 'c1' } as any);
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    act(() => {
      result.current.openEditCategoryModal({ _id: 'c1', name: 'Old', description: 'd', color: '#000', datasetId: 'ds1' } as any);
    });
    expect(result.current.categoryForm.name).toBe('Old');

    act(() => {
      result.current.setCategoryForm({ name: 'Updated', description: 'd2', color: '#111' });
    });

    await act(async () => {
      await result.current.handleSaveCategory();
    });

    expect(mockedUpdate).toHaveBeenCalledWith('c1', { name: 'Updated', description: 'd2', color: '#111' });
    expect(result.current.categoryAlert).toEqual({ type: 'success', message: 'Category updated successfully' });
  });

  it('shows an error alert when create fails', async () => {
    mockedCreate.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    act(() => {
      result.current.setCategoryForm({ name: 'New Cat', description: '', color: '#fff' });
    });

    await act(async () => {
      await result.current.handleSaveCategory();
    });

    expect(result.current.categoryAlert).toEqual({ type: 'error', message: 'Failed to create category' });
  });

  it('deletes a category after window.confirm returns true', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockedDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleDeleteCategory('c1');
    });

    expect(mockedDelete).toHaveBeenCalledWith('c1');
    expect(result.current.categoryAlert).toEqual({ type: 'success', message: 'Category deleted successfully' });
    confirmSpy.mockRestore();
  });

  it('skips deletion when window.confirm returns false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleDeleteCategory('c1');
    });

    expect(mockedDelete).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('clears the alert automatically after 5 seconds', async () => {
    mockedCreate.mockResolvedValue({ _id: 'c1' } as any);
    const { result } = renderHook(() => useDatasetCategoryManager('ds1'), { wrapper: makeWrapper() });

    act(() => {
      result.current.setCategoryForm({ name: 'New Cat', description: '', color: '#fff' });
    });

    await act(async () => {
      await result.current.handleSaveCategory();
    });

    expect(result.current.categoryAlert).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.categoryAlert).toBeNull();
  });
});
