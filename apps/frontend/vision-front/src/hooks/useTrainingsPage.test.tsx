import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

let authState: { isAuthenticated: boolean } = { isAuthenticated: true };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

vi.mock('../services/trainingService', () => ({
  trainingService: {
    getTrainings: vi.fn(),
    createTraining: vi.fn(),
    updateTraining: vi.fn(),
    deleteTraining: vi.fn(),
  },
}));
vi.mock('../services/configService', () => ({
  configService: { getAllConfigs: vi.fn() },
}));
vi.mock('../services/projectService', () => ({
  projectService: { getProjects: vi.fn() },
}));
vi.mock('../services/analysisService', () => ({
  getAllAnalyses: vi.fn(),
}));
vi.mock('../utils/csvExport', () => ({
  exportTrainingsToCSV: vi.fn(),
}));

import { trainingService } from '../services/trainingService';
import { configService } from '../services/configService';
import { projectService } from '../services/projectService';
import { getAllAnalyses } from '../services/analysisService';
import { exportTrainingsToCSV } from '../utils/csvExport';
import { useTrainingsPage } from './useTrainingsPage';
import type { Training } from '../types';

const mockedTraining = vi.mocked(trainingService);
const mockedConfig = vi.mocked(configService);
const mockedProject = vi.mocked(projectService);
const mockedGetAllAnalyses = vi.mocked(getAllAnalyses);
const mockedExportCSV = vi.mocked(exportTrainingsToCSV);

const makeTraining = (overrides: Partial<Training> = {}): Training =>
  ({
    _id: 't1',
    uuid: 'uuid-1',
    name: 'Training 1',
    status: 'completed',
    tags: ['a', 'b'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  } as unknown as Training);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  authState = { isAuthenticated: true };
  mockedTraining.getTrainings.mockResolvedValue({
    success: true,
    data: { trainings: [makeTraining()], pagination: { page: 1, limit: 100, total: 1, pages: 1 } },
  } as never);
  mockedConfig.getAllConfigs.mockResolvedValue({ success: true, data: { configs: [] } } as never);
  mockedProject.getProjects.mockResolvedValue({ success: true, data: [] } as never);
  mockedGetAllAnalyses.mockResolvedValue({ success: true, data: [] } as never);
});

describe('useTrainingsPage', () => {
  it('loads trainings and available tags on mount', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.displayTrainings).toHaveLength(1);
    expect(result.current.totalCount).toBe(1);
    await waitFor(() => expect(result.current.availableTags).toEqual(['a', 'b']));
  });

  it('falls back to an empty tag list when loading tags fails', async () => {
    mockedTraining.getTrainings.mockImplementation(() =>
      Promise.reject(new Error('boom'))
    );

    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });

    await waitFor(() => expect(mockedTraining.getTrainings).toHaveBeenCalled());
    await waitFor(() => expect(result.current.availableTags).toEqual([]));
  });

  it('debounces search and resets to page 0', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setSearchTerm('resnet');
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    await vi.waitFor(() => expect(mockedTraining.getTrainings).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'resnet' })
    ));
    vi.useRealTimers();
  });

  it('handles pagination and rows-per-page changes', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleChangePage(null, 2));
    expect(result.current.page).toBe(2);

    act(() =>
      result.current.handleChangeRowsPerPage({ target: { value: '50' } } as React.ChangeEvent<HTMLInputElement>)
    );
    expect(result.current.rowsPerPage).toBe(50);
    expect(result.current.page).toBe(0);
  });

  it('toggles sort order when the same column is clicked twice', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSort('name'));
    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('desc');

    act(() => result.current.handleSort('name'));
    expect(result.current.sortOrder).toBe('asc');

    act(() => result.current.handleSort('status'));
    expect(result.current.sortBy).toBe('status');
    expect(result.current.sortOrder).toBe('desc');
  });

  it('rejects creating a training with a blank name', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.handleCreateTraining();
    });

    expect(result.current.createError).toBe('Training name is required');
    expect(mockedTraining.createTraining).not.toHaveBeenCalled();
  });

  it('creates a training and resets the form on success', async () => {
    mockedTraining.createTraining.mockResolvedValue({ success: true, data: makeTraining() } as never);
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setTrainingName('New Training'));
    await act(async () => {
      await result.current.handleCreateTraining();
    });

    expect(mockedTraining.createTraining).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Training' })
    );
    expect(result.current.createSuccess).toContain('created successfully');
    expect(result.current.createModalOpen).toBe(false);
  });

  it('updates a training when editingTrainingId is set', async () => {
    mockedTraining.updateTraining.mockResolvedValue({ success: true, data: makeTraining() } as never);
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleEditTraining(makeTraining({ name: 'Existing' })));
    expect(result.current.editingTrainingId).toBe('t1');
    expect(result.current.createModalOpen).toBe(true);

    await act(async () => {
      await result.current.handleCreateTraining();
    });

    expect(mockedTraining.updateTraining).toHaveBeenCalledWith('t1', expect.objectContaining({ name: 'Existing' }));
    expect(result.current.createSuccess).toBe('Training updated successfully!');
  });

  it('surfaces an error message when create/update fails', async () => {
    mockedTraining.createTraining.mockRejectedValue(new Error('name taken'));
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setTrainingName('Dup'));
    await act(async () => {
      await result.current.handleCreateTraining();
    });

    expect(result.current.createError).toBe('name taken');
  });

  it('closes the modal and resets fields, but not while creating', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setTrainingName('Draft'));
    act(() => result.current.handleCloseModal());

    expect(result.current.trainingName).toBe('');
    expect(result.current.createModalOpen).toBe(false);
  });

  it('opens and confirms a single-training delete', async () => {
    vi.useFakeTimers();
    mockedTraining.deleteTraining.mockResolvedValue({ success: true } as never);
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleDeleteClick('t1'));
    expect(result.current.deleteDialogOpen).toBe(true);
    expect(result.current.deleteTrainingId).toBe('t1');

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(mockedTraining.deleteTraining).toHaveBeenCalledWith('t1');
    expect(result.current.createSuccess).toBe('Training deleted successfully!');
    expect(result.current.deleteDialogOpen).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
  });

  it('surfaces an error when delete fails', async () => {
    mockedTraining.deleteTraining.mockRejectedValue(new Error('cannot delete'));
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleDeleteClick('t1'));
    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    expect(result.current.createError).toBe('cannot delete');
  });

  it('toggles selection and select-all', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSelectTraining('t1'));
    expect(result.current.selectedTrainingIds.has('t1')).toBe(true);

    act(() => result.current.handleSelectTraining('t1'));
    expect(result.current.selectedTrainingIds.has('t1')).toBe(false);

    act(() => result.current.handleSelectAll());
    expect(result.current.selectedTrainingIds.size).toBe(result.current.displayTrainings.length);

    act(() => result.current.handleSelectAll());
    expect(result.current.selectedTrainingIds.size).toBe(0);
  });

  it('navigates to the compare page with selected ids, but only for 2+ selections', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSelectTraining('t1'));
    act(() => result.current.handleCompareSelected());
    expect(navigateMock).not.toHaveBeenCalled();

    act(() => result.current.handleSelectTraining('t2'));
    act(() => result.current.handleCompareSelected());
    expect(navigateMock).toHaveBeenCalledWith(expect.stringContaining('/trainings/compare?ids='));
  });

  it('exports only the selected trainings to CSV', async () => {
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSelectTraining('t1'));
    act(() => result.current.exportToCSV());

    expect(mockedExportCSV).toHaveBeenCalledWith([expect.objectContaining({ _id: 't1' })]);
  });

  it('deletes multiple selected trainings', async () => {
    vi.useFakeTimers();
    mockedTraining.deleteTraining.mockResolvedValue({ success: true } as never);
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await vi.waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSelectTraining('t1'));
    await act(async () => {
      await result.current.handleDeleteSelected();
    });

    expect(mockedTraining.deleteTraining).toHaveBeenCalledWith('t1');
    expect(result.current.createSuccess).toContain('deleted successfully');
    expect(result.current.selectedTrainingIds.size).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    vi.useRealTimers();
  });

  it('surfaces an error when bulk delete fails', async () => {
    mockedTraining.deleteTraining.mockRejectedValue(new Error('bulk fail'));
    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.handleSelectTraining('t1'));
    await act(async () => {
      await result.current.handleDeleteSelected();
    });

    expect(result.current.createError).toBe('bulk fail');
  });

  it('fetches everything and filters+paginates on the frontend when excludedTags is set', async () => {
    mockedTraining.getTrainings
      .mockResolvedValueOnce({
        success: true,
        data: { trainings: [makeTraining()], pagination: { page: 1, limit: 1000, total: 1, pages: 1 } },
      } as never)
      .mockResolvedValue({
        success: true,
        data: {
          trainings: [
            makeTraining({ _id: 't1', tags: ['keep'] }),
            makeTraining({ _id: 't2', tags: ['drop'] }),
          ],
          pagination: { page: 1, limit: 10000, total: 2, pages: 1 },
        },
      } as never);

    const { result } = renderHook(() => useTrainingsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setExcludedTags(['drop']));

    await waitFor(() => expect(result.current.totalCount).toBe(1));
    expect(result.current.displayTrainings.every((t: Training) => t._id !== 't2')).toBe(true);
  });
});
