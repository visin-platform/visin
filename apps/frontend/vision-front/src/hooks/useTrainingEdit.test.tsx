import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/trainingService', () => ({
  trainingService: { updateTraining: vi.fn(), getTrainings: vi.fn(), getTrainingTags: vi.fn() }
}));
vi.mock('../services/projectService', () => ({
  projectService: { getProjects: vi.fn() }
}));

import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { useTrainingEdit } from './useTrainingEdit';
import type { Training } from '../types';

const mockedTraining = vi.mocked(trainingService);
const mockedProject = vi.mocked(projectService);

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
    mockedProject.getProjects.mockResolvedValue({ success: true, data: [{ _id: 'p1' }] as any });
    mockedTraining.getTrainingTags.mockResolvedValue({ success: true, data: ['a', 'b', 'c'] });
  });

  it('handleEditTraining opens the dialog prefilled without waiting on any request', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    // Synchronous on purpose: the dialog is open before the pickers it holds
    // have asked the API for anything.
    act(() => {
      result.current.handleEditTraining();
    });

    expect(result.current.editDialogOpen).toBe(true);
    expect(result.current.editName).toBe('Training One');
    expect(result.current.editDatasetId).toBe('d1');
    expect(result.current.editProjectId).toBe('p1');
    expect(result.current.editStatus).toBe('running');
    expect(result.current.editTags).toEqual(['a', 'b']);
    // The pickers' requests are in flight, not awaited: the dialog is already
    // open and prefilled while they are still empty.
    expect(result.current.editProjects).toEqual([]);
    expect(result.current.availableTags).toEqual([]);
  });

  it('loads the project list and tag suggestions once the dialog is open', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditTraining();
    });

    await waitFor(() => expect(result.current.editProjects).toEqual([{ _id: 'p1' }]));
    expect(result.current.availableTags).toEqual(['a', 'b', 'c']);
    // Never the full list endpoint: the tags come from their own cheap route.
    expect(mockedTraining.getTrainings).not.toHaveBeenCalled();
  });

  it('does nothing when training is undefined', async () => {
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(undefined, refetch), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditTraining();
    });

    expect(mockedProject.getProjects).not.toHaveBeenCalled();
    expect(result.current.editDialogOpen).toBe(false);
  });

  it('handleEditConfirm updates the training and refetches on success', async () => {
    mockedTraining.updateTraining.mockResolvedValue({ success: true, data: training });
    const refetch = vi.fn();
    const { result } = renderHook(() => useTrainingEdit(training, refetch), { wrapper: makeWrapper() });

    act(() => {
      result.current.handleEditTraining();
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

    act(() => {
      result.current.handleEditTraining();
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

    act(() => {
      result.current.handleEditTraining();
    });

    act(() => {
      result.current.handleEditCancel();
    });

    expect(result.current.editDialogOpen).toBe(false);
    expect(result.current.editName).toBe('');
    expect(result.current.editTags).toEqual([]);
  });
});
