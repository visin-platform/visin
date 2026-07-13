import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/visualizationService', () => ({
  visualizationService: {
    getVisualizationsByTraining: vi.fn(),
    getVisualizationTypes: vi.fn(),
    uploadVisualization: vi.fn(),
    deleteVisualization: vi.fn()
  }
}));

import { visualizationService } from '../services/visualizationService';
import { useTrainingVisualizations } from './useTrainingVisualizations';

const mockedService = vi.mocked(visualizationService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const makeViz = (id: string, filename: string, epoch: number) => ({ _id: id, filename, epoch } as any);

describe('useTrainingVisualizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedService.getVisualizationTypes.mockResolvedValue({ success: true, data: { types: ['chart', 'plot'] } });
    mockedService.getVisualizationsByTraining.mockResolvedValue({
      success: true,
      data: { visualizations: [makeViz('v1', 'imgA.png', 1), makeViz('v2', 'imgB.png', 2)], total: 2 }
    } as never);
  });

  it('loads visualizations and types for the given training', async () => {
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.visualizations).toHaveLength(2);
    expect(result.current.types).toEqual(['chart', 'plot']);
  });

  it('filters visualizations client-side by epoch', async () => {
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSelectedEpochFilter('1');
    });

    expect(result.current.visualizations).toHaveLength(1);
    expect(result.current.visualizations[0]._id).toBe('v1');
  });

  it('filters visualizations client-side by filename substring', async () => {
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setSelectedImageName('imgb');
    });

    expect(result.current.visualizations).toHaveLength(1);
    expect(result.current.visualizations[0]._id).toBe('v2');
  });

  it('handleUpload uploads the file and invalidates queries on success', async () => {
    mockedService.uploadVisualization.mockResolvedValue({ success: true, data: {} as any });
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(['x'], 'chart.png', { type: 'image/png' });
    let uploadResult: boolean | undefined;
    await act(async () => {
      uploadResult = await result.current.handleUpload('e1', file, 'chart');
    });

    expect(uploadResult).toBe(true);
    expect(mockedService.uploadVisualization).toHaveBeenCalledWith('e1', file, 'chart');
    expect(result.current.error).toBeNull();
  });

  it('handleUpload returns false and sets an error message on failure', async () => {
    mockedService.uploadVisualization.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const file = new File(['x'], 'chart.png', { type: 'image/png' });
    let uploadResult: boolean | undefined;
    await act(async () => {
      uploadResult = await result.current.handleUpload('e1', file, 'chart');
    });

    expect(uploadResult).toBe(false);
    expect(result.current.error).toBe('Failed to upload visualization');
  });

  it('handleDelete deletes the visualization and returns true on success', async () => {
    mockedService.deleteVisualization.mockResolvedValue({ success: true, data: undefined });
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.handleDelete('v1');
    });

    expect(deleteResult).toBe(true);
    expect(mockedService.deleteVisualization).toHaveBeenCalledWith('v1');
  });

  it('handleDelete returns false and sets an error message on failure', async () => {
    mockedService.deleteVisualization.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTrainingVisualizations({ training_uuid: 't1' }), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let deleteResult: boolean | undefined;
    await act(async () => {
      deleteResult = await result.current.handleDelete('v1');
    });

    expect(deleteResult).toBe(false);
    expect(result.current.error).toBe('Failed to delete visualization');
  });
});
