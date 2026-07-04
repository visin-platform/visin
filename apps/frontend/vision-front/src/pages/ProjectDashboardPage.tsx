import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';

import { projectService } from '../services/projectService';
import { useAuth } from '../contexts/AuthContext';

// New components
import ProjectHeader from '../components/project/ProjectHeader';
import ProjectTabs from '../components/project/ProjectTabs';
import EditProjectDialog from '../components/project/EditProjectDialog';
import DeleteProjectDialog from '../components/project/DeleteProjectDialog';

// Custom hook
import { useProjectDashboard } from '../hooks/useProjectDashboard';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';



const ProjectDashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();

  const tabNameToIndex: Record<string, number> = {
    overview: 0,
    trainings: 1,
    tests: 2,
    visualizations: 3,
    benchmarks: 4,
    comparisons: 5,
    settings: 6
  };

  const indexToTabName: Record<number, string> = {
    0: 'overview',
    1: 'trainings',
    2: 'tests',
    3: 'visualizations',
    4: 'benchmarks',
    5: 'comparisons',
    6: 'settings'
  };

  React.useEffect(() => {
    const tabQuery = searchParams.get('tab');
    if (tabQuery && tabNameToIndex[tabQuery] !== undefined) {
      setTabValue(tabNameToIndex[tabQuery]);
    }
  }, [searchParams]);

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    isPublic: false
  });

  // Use custom hook for all project data
  const {
    project,
    stats,
    dashboardStats,
    fullTrainings,
    testResults,
    visualizations,
    benchmarks,
    isProjectLoading,
    isStatsLoading,
    isDashboardStatsLoading,
    isFullTrainingsLoading,
    isTestResultsLoading,
    isVisualizationsLoading,
    isBenchmarksLoading,
    projectError,
    page,
    rowsPerPage,
    sortBy,
    sortOrder,
    testsPage,
    testsRowsPerPage,
    benchmarksPage,
    benchmarksRowsPerPage,
    handlePageChange,
    handleRowsPerPageChange,
    handleTestsPageChange,
    handleTestsRowsPerPageChange,
    handleBenchmarksPageChange,
    handleBenchmarksRowsPerPageChange,
    handleSort,
    invalidateProjectQueries
  } = useProjectDashboard(id, tabValue);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    const tabName = indexToTabName[newValue];
    if (tabName) {
      setSearchParams({ tab: tabName });
    }
  };

  const updateProjectMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('No project id');
      return projectService.updateProject(id, editFormData);
    },
    onSuccess: () => {
      setEditDialogOpen(false);
      invalidateProjectQueries();
    },
    onError: (error) => {
      console.error('Failed to update project:', error);
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('No project id');
      return projectService.deleteProject(id);
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
      navigate('/projects');
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
    }
  });

  // Project edit/delete handlers
  const handleEditProject = () => {
    if (project) {
      setEditFormData({
        name: project.name,
        description: project.description || '',
        isPublic: project.isPublic
      });
      setEditDialogOpen(true);
    }
  };

  const handleUpdateProject = () => {
    if (!id) return;
    updateProjectMutation.mutate();
  };

  const handleDeleteProject = () => {
    if (!id) return;
    deleteProjectMutation.mutate();
  };

  if (isProjectLoading || isStatsLoading || (tabValue === 0 && isDashboardStatsLoading)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (projectError || !project) {
    return (
      <Container maxWidth="xl" sx={{ mt: 0 }}>
        <Alert severity="error">
          Failed to load project. It may not exist or you don't have permission to view it.
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/projects')} sx={{ mt: 2 }}>
          Back to Projects
        </Button>
      </Container>
    );
  }

  const isOwner = user?.id === project.ownerId;

  return (
    <Container maxWidth="xl" sx={{ mt: 0, mb: 8 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: project.name, current: true }
        ]}
      />

      <ProjectHeader
        project={project}
        isOwner={isOwner}
        onEdit={handleEditProject}
        onDelete={() => setDeleteDialogOpen(true)}
      />

      <ProjectTabs
        tabValue={tabValue}
        onTabChange={handleTabChange}
        isOwner={isOwner}
        projectId={id!}
        stats={stats}
        dashboardStats={dashboardStats}
        isAuthenticated={isAuthenticated}
        user={user}
        trainings={fullTrainings?.trainings || []}
        isFullTrainingsLoading={isFullTrainingsLoading}
        page={page}
        rowsPerPage={rowsPerPage}
        total={fullTrainings?.pagination.total || 0}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        testResultsResponse={testResults}
        isTestResultsLoading={isTestResultsLoading}
        testsPage={testsPage}
        testsRowsPerPage={testsRowsPerPage}
        onTestsPageChange={handleTestsPageChange}
        onTestsRowsPerPageChange={handleTestsRowsPerPageChange}
        visualizationsResponse={visualizations}
        isVisualizationsLoading={isVisualizationsLoading}
        benchmarksResponse={benchmarks}
        isBenchmarksLoading={isBenchmarksLoading}
        benchmarksPage={benchmarksPage}
        benchmarksRowsPerPage={benchmarksRowsPerPage}
        onBenchmarksPageChange={handleBenchmarksPageChange}
        onBenchmarksRowsPerPageChange={handleBenchmarksRowsPerPageChange}
        project={project}
      />

      <EditProjectDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        formData={editFormData}
        onFormDataChange={setEditFormData}
        onSubmit={handleUpdateProject}
        isUpdating={updateProjectMutation.isPending}
      />

      <DeleteProjectDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteProject}
        isDeleting={deleteProjectMutation.isPending}
      />
    </Container>
  );
};

export default ProjectDashboardPage;
