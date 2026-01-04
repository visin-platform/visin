import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { visualizationService } from '../services/visualizationService';
import { benchmarkService } from '../services/benchmarkService';

export const useProjectDashboard = (projectId: string | undefined, tabValue: number) => {
  const queryClient = useQueryClient();

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination state for Tests tab
  const [testsPage, setTestsPage] = useState(0);
  const [testsRowsPerPage, setTestsRowsPerPage] = useState(50);

  // Pagination state for Benchmarks tab
  const [benchmarksPage, setBenchmarksPage] = useState(0);
  const [benchmarksRowsPerPage, setBenchmarksRowsPerPage] = useState(50);

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
  const {
    data: statsResponse,
    isLoading: isStatsLoading
  } = useQuery({
    queryKey: ['project-stats', projectId],
    queryFn: () => trainingService.getTrainingStats({ projectId }),
    enabled: !!projectId
  });

  // Dashboard stats query
  const {
    data: dashboardStatsResponse,
    isLoading: isDashboardStatsLoading
  } = useQuery({
    queryKey: ['project-dashboard-stats', projectId],
    queryFn: () => projectService.getProjectDashboardStats(projectId!),
    enabled: !!projectId
  });

  // Full trainings query
  const {
    data: fullTrainingsResponse,
    isLoading: isFullTrainingsLoading
  } = useQuery({
    queryKey: ['project-trainings-full', projectId, page, rowsPerPage, sortBy, sortOrder],
    queryFn: () => trainingService.getTrainings({
      projectId,
      page: page + 1,
      limit: rowsPerPage,
      sortBy,
      order: sortOrder
    }),
    enabled: !!projectId && tabValue === 1
  });

  // Test results query
  const {
    data: testResultsResponse,
    isLoading: isTestResultsLoading
  } = useQuery({
    queryKey: ['project-test-results', projectResponse?.data?._id, testsPage, testsRowsPerPage],
    queryFn: () => testResultService.getTestResults({
      projectId: projectResponse?.data?._id,
      page: testsPage + 1,
      limit: testsRowsPerPage
    }),
    enabled: !!projectResponse?.data && tabValue === 2
  });

  // Visualizations query
  const {
    data: visualizationsResponse,
    isLoading: isVisualizationsLoading
  } = useQuery({
    queryKey: ['project-visualizations', projectResponse?.data?._id],
    queryFn: () => visualizationService.getVisualizationsByTraining('', {
      projectId: projectResponse?.data?._id,
      includeUrls: false
    }),
    enabled: !!projectResponse?.data && tabValue === 3
  });

  // Benchmarks query
  const {
    data: benchmarksResponse,
    isLoading: isBenchmarksLoading
  } = useQuery({
    queryKey: ['project-benchmarks', projectResponse?.data?._id, benchmarksPage, benchmarksRowsPerPage],
    queryFn: () => benchmarkService.getBenchmarks({
      projectId: projectResponse?.data?._id,
      page: benchmarksPage + 1,
      limit: benchmarksRowsPerPage
    }),
    enabled: !!projectResponse?.data && tabValue === 4
  });

  // Pagination handlers
  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleTestsPageChange = (_event: unknown, newPage: number) => {
    setTestsPage(newPage);
  };

  const handleTestsRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTestsRowsPerPage(parseInt(event.target.value, 10));
    setTestsPage(0);
  };

  const handleBenchmarksPageChange = (_event: unknown, newPage: number) => {
    setBenchmarksPage(newPage);
  };

  const handleBenchmarksRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBenchmarksRowsPerPage(parseInt(event.target.value, 10));
    setBenchmarksPage(0);
  };

  const handleSort = (column: any) => {
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
    testResults: testResultsResponse,
    visualizations: visualizationsResponse,
    benchmarks: benchmarksResponse,

    // Loading states
    isProjectLoading,
    isStatsLoading,
    isDashboardStatsLoading,
    isFullTrainingsLoading,
    isTestResultsLoading,
    isVisualizationsLoading,
    isBenchmarksLoading,

    // Errors
    projectError,

    // Pagination state
    page,
    rowsPerPage,
    sortBy,
    sortOrder,
    testsPage,
    testsRowsPerPage,
    benchmarksPage,
    benchmarksRowsPerPage,

    // Pagination handlers
    handlePageChange,
    handleRowsPerPageChange,
    handleTestsPageChange,
    handleTestsRowsPerPageChange,
    handleBenchmarksPageChange,
    handleBenchmarksRowsPerPageChange,
    handleSort,

    // Utilities
    invalidateProjectQueries
  };
};