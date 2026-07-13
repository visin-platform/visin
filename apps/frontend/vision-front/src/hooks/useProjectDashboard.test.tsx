import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../services/projectService', () => ({
  projectService: { getProjectById: vi.fn(), getProjectDashboardStats: vi.fn() }
}));
vi.mock('../services/trainingService', () => ({
  trainingService: { getTrainingStats: vi.fn(), getTrainings: vi.fn() }
}));
vi.mock('../services/testResultService', () => ({
  testResultService: { getTestResults: vi.fn() }
}));
vi.mock('../services/visualizationService', () => ({
  visualizationService: { getVisualizationsByTraining: vi.fn() }
}));
vi.mock('../services/benchmarkService', () => ({
  benchmarkService: { getBenchmarks: vi.fn() }
}));

import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { visualizationService } from '../services/visualizationService';
import { benchmarkService } from '../services/benchmarkService';
import { useProjectDashboard } from './useProjectDashboard';

const mockedProject = vi.mocked(projectService);
const mockedTraining = vi.mocked(trainingService);
const mockedTestResult = vi.mocked(testResultService);
const mockedVisualization = vi.mocked(visualizationService);
const mockedBenchmark = vi.mocked(benchmarkService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe('useProjectDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedProject.getProjectById.mockResolvedValue({ success: true, data: { _id: 'p1', name: 'Project 1' } as any });
    mockedProject.getProjectDashboardStats.mockResolvedValue({ success: true, data: {} as any });
    mockedTraining.getTrainingStats.mockResolvedValue({ success: true, data: {} as any });
    mockedTraining.getTrainings.mockResolvedValue({ success: true, data: { trainings: [], pagination: {} as any } });
    mockedTestResult.getTestResults.mockResolvedValue({ success: true, data: { testResults: [], pagination: {} as any } });
    mockedVisualization.getVisualizationsByTraining.mockResolvedValue({ success: true, data: { visualizations: [], total: 0 } } as never);
    mockedBenchmark.getBenchmarks.mockResolvedValue({ success: true, data: { benchmarks: [], pagination: {} } } as never);
  });

  it('does not fetch the project when projectId is undefined', () => {
    renderHook(() => useProjectDashboard(undefined, 0), { wrapper: makeWrapper() });
    expect(mockedProject.getProjectById).not.toHaveBeenCalled();
  });

  it('loads the project and dependent stats queries once the project resolves', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 0), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.project?._id).toBe('p1'));
    await waitFor(() => expect(mockedTraining.getTrainingStats).toHaveBeenCalledWith({ projectId: 'p1' }));
    await waitFor(() => expect(mockedProject.getProjectDashboardStats).toHaveBeenCalledWith('p1'));
  });

  it('only fetches full trainings when tabValue is 1', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 0), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));
    expect(mockedTraining.getTrainings).not.toHaveBeenCalled();
  });

  it('fetches full trainings with pagination params when tabValue is 1', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));
    await waitFor(() =>
      expect(mockedTraining.getTrainings).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 'p1', page: 1, limit: 50 })
      )
    );
  });

  it('fetches test results only when tabValue is 2', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 2), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));
    await waitFor(() => expect(mockedTestResult.getTestResults).toHaveBeenCalled());
  });

  it('handlePageChange updates the page state', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));

    act(() => {
      result.current.handlePageChange(null, 2);
    });

    expect(result.current.page).toBe(2);
  });

  it('handleRowsPerPageChange resets page to 0', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));

    act(() => {
      result.current.handlePageChange(null, 3);
    });
    act(() => {
      result.current.handleRowsPerPageChange({ target: { value: '25' } } as any);
    });

    expect(result.current.rowsPerPage).toBe(25);
    expect(result.current.page).toBe(0);
  });

  it('handleSort toggles order when the same column is selected again', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 1), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));

    expect(result.current.sortBy).toBe('updatedAt');
    expect(result.current.sortOrder).toBe('desc');

    act(() => {
      result.current.handleSort('updatedAt');
    });
    expect(result.current.sortOrder).toBe('asc');

    act(() => {
      result.current.handleSort('name');
    });
    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('invalidateProjectQueries triggers a refetch of the project query', async () => {
    const { result } = renderHook(() => useProjectDashboard('p1', 0), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.project?._id).toBe('p1'));

    mockedProject.getProjectById.mockClear();

    act(() => {
      result.current.invalidateProjectQueries();
    });

    await waitFor(() => expect(mockedProject.getProjectById).toHaveBeenCalled());
  });
});
