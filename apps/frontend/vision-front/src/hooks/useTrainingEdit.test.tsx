import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/trainingService', () => ({
  trainingService: { updateTraining: vi.fn(), getTrainings: vi.fn() }
}));
vi.mock('../services/projectService', () => ({
  projectService: { getProjects: vi.fn() }
}));
vi.mock('../services/analysisService', () => ({
  getAllAnalyses: vi.fn()
}));

import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { getAllAnalyses } from '../services/analysisService';
import { useTrainingEdit } from './useTrainingEdit';
import type { Training } from '../types';

const mockedTraining = vi.mocked(trainingService);
const mockedProject = vi.mocked(projectService);
const mockedAnalyses = vi.mocked(getAllAnalyses);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const training: Training = {
  _id: 't1',
  name: 'Training One',
  description: 'desc',
  configId: 'c1',
  datasetId: 'd1',
  projectId: 'p1',
  status: 'running',
  tags: ['a', 'b']
} as any;

describe('useTrainingEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAnalyses.mockResolvedValue({ data: [{ _id: 'a1' }] as any, pagination: {} as any });
    mockedProject.getProjects.mockResolvedValue({ success: true, data: [{ _id: 'p1' }] as any });
    mockedTraining.getTrainings.mockResolvedValue({
      success: true,
      data: { trainings: [{ _id: 't1', tags: ['a', 'b'] }, { _id: 't2', tags: ['b', 'c'] }] as any, pagination: {} as any }
    });
  });

  it('handleEditTraining loads datasets/projects/tags and opens the dialog prefilled', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEditTraining();
    });

    expect(result.current.editDialogOpen).toBe(true);
    expect(result.current.editName).toBe('Training One');
    expect(result.current.editDatasetId).toBe('d1');
    expect(result.current.editProjectId).toBe('p1');
    expect(result.current.editStatus).toBe('running');
    expect(result.current.editTags).toEqual(['a', 'b']);
    expect(result.current.availableTags).toEqual(['a', 'b', 'c']);
    expect(result.current.editDatasets).toEqual([{ _id: 'a1' }]);
    expect(result.current.editProjects).toEqual([{ _id: 'p1' }]);
  });

  it('does nothing when training is undefined', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(undefined, refetch), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEditTraining();
    });

    expect(mockedProject.getProjects).not.toHaveBeenCalled();
    expect(result.current.editDialogOpen).toBe(false);
  });

  it('handleEditConfirm updates the training and refetches on success', async () => {
    mockedTraining.updateTraining.mockResolvedValue({ success: true, data: training });
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEditTraining();
    });
    act(() => {
      result.current.setEditName('Updated Name');
    });

    await act(async () => {
      await result.current.handleEditConfirm();
    });

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(mockedTraining.updateTraining).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Updated Name' }));
    expect(result.current.editDialogOpen).toBe(false);
  });

  it('handleEditConfirm is a no-op when the name is blank', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    act(() => {
      result.current.setEditName('   ');
    });

    await act(async () => {
      await result.current.handleEditConfirm();
    });

    expect(mockedTraining.updateTraining).not.toHaveBeenCalled();
  });

  it('surfaces an error message when the update mutation fails', async () => {
    mockedTraining.updateTraining.mockRejectedValue(new Error('update failed'));
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEditTraining();
    });
    act(() => {
      result.current.setEditName('Still valid');
    });

    await act(async () => {
      await result.current.handleEditConfirm();
    });

    await waitFor(() => expect(result.current.updateError).toBe('update failed'));
  });

  it('handleEditCancel resets the form and closes the dialog', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.handleEditTraining();
    });

    act(() => {
      result.current.handleEditCancel();
    });

    expect(result.current.editDialogOpen).toBe(false);
    expect(result.current.editName).toBe('');
    expect(result.current.editTags).toEqual([]);
  });
});
