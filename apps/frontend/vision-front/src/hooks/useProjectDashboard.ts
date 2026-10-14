import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
import { runEvaluationService } from '../services/runEvaluationService';
import { benchmarkService } from '../services/benchmarkService';
import type { ProjectTabKey } from '../components/project/projectTabs';

type TrainingSortColumn =
  'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';

/** The most evaluations the project's Evaluations tab loads, newest first. */
const PROJECT_TESTS_LIMIT = 500;
/** The same, for benchmarks, which the tab groups by device. */
const PROJECT_BENCHMARKS_LIMIT = 500;

export const useProjectDashboard = (projectId: string | undefined, tab: ProjectTabKey) => {
  const queryClient = useQueryClient();

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortBy, setSortBy] = useState<TrainingSortColumn>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Project query
  const {
    data: projectResponse,
    isLoading: isProjectLoading,
    error: projectError
  } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectService.getProjectById(projectId!),
    enabled: !!projectId
  });

  // Stats query
  const { data: statsResponse, isLoading: isStatsLoading } = useQuery({
    queryKey: ['project-stats', projectId],
    queryFn: () => trainingService.getTrainingStats({ projectId: projectResponse?.data?._id }),
    enabled: !!projectResponse?.data
  });

  // Dashboard stats query
  const { data: dashboardStatsResponse, isLoading: isDashboardStatsLoading } = useQuery({
    queryKey: ['project-dashboard-stats', projectId],
    queryFn: () => projectService.getProjectDashboardStats(projectResponse!.data!._id),
    enabled: !!projectResponse?.data
  });

  // Full trainings query
  const { data: fullTrainingsResponse, isLoading: isFullTrainingsLoading } = useQuery({
    queryKey: ['project-trainings-full', projectId, page, rowsPerPage, sortBy, sortOrder],
    queryFn: () =>
      trainingService.getTrainings({
        projectId: projectResponse?.data?._id,
        page: page + 1,
        limit: rowsPerPage,
        sortBy,
        order: sortOrder
      }),
    enabled: !!projectResponse?.data && tab === 'trainings'
  });

  // Evaluations query: every evaluation of the project, up to a cap, because the tab ranks runs by their
  // best test and a page of them cannot say which run that is.
  const { data: evaluationsResponse, isLoading: isEvaluationsLoading } = useQuery({
    queryKey: ['project-evaluations', projectId],
    queryFn: () =>
      runEvaluationService.list({
        projectId: projectResponse?.data?._id,
        page: 1,
        limit: PROJECT_TESTS_LIMIT
      }),
    enabled: !!projectResponse?.data && tab === 'evaluations'
  });

  // Benchmarks query
  const { data: benchmarksResponse, isLoading: isBenchmarksLoading } = useQuery({
    queryKey: ['project-benchmarks', projectId],
    queryFn: () =>
      benchmarkService.getBenchmarks({
        projectId: projectResponse?.data?._id,
        page: 1,
        limit: PROJECT_BENCHMARKS_LIMIT
      }),
    enabled: !!projectResponse?.data && tab === 'benchmarks'
  });

  // Pagination handlers
  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSort = (column: TrainingSortColumn) => {
    const isAsc = sortBy === column && sortOrder === 'asc';
    setSortOrder(isAsc ? 'desc' : 'asc');
    setSortBy(column);
  };

  const invalidateProjectQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['project-dashboard-stats', projectId] });
  };

  return {
    // Data
    project: projectResponse?.data,
    stats: statsResponse?.data,
    dashboardStats: dashboardStatsResponse?.data,
    fullTrainings: fullTrainingsResponse?.data,
    evaluations: evaluationsResponse,
    benchmarks: benchmarksResponse,

    // Loading states
    isProjectLoading,
    isStatsLoading,
    isDashboardStatsLoading,
    isFullTrainingsLoading,
    isEvaluationsLoading,
    isBenchmarksLoading,

    // Errors
    projectError,

    // Pagination state
    page,
    rowsPerPage,
    sortBy,
    sortOrder,

    // Pagination handlers
    handlePageChange,
    handleRowsPerPageChange,
    handleSort,

    // Utilities
    invalidateProjectQueries
  };
};
