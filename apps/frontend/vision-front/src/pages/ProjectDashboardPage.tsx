import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Container, CircularProgress, Alert, Button } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTrackVisit } from '@visin/frontend-core';

import { projectService } from '../services/projectService';
import { useAuth } from '../contexts/AuthContext';

// New components
import CitedInPapers from '../components/project/CitedInPapers';
import ProjectHeader from '../components/project/ProjectHeader';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { CostingProvider } from '../costing/CostingProvider';
import ProjectTabs from '../components/project/ProjectTabs';
import { resolveProjectTab, type ProjectTabKey } from '../components/project/projectTabs';
import DeleteProjectDialog from '../components/project/DeleteProjectDialog';

// Custom hook
import { useProjectDashboard } from '../hooks/useProjectDashboard';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { usePageTitle } from '../hooks/usePageTitle';

const ProjectDashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // The address is the one source of the open tab. Which tabs load data does not depend on Settings, so the
  // project's own permission is applied after it has loaded, below.
  const requestedTab = searchParams.get('tab');

  // Use custom hook for all project data
  const {
    project,
    stats,
    dashboardStats,
    fullTrainings,
    evaluations,
    benchmarks,
    isProjectLoading,
    isStatsLoading,
    isDashboardStatsLoading,
    isFullTrainingsLoading,
    isEvaluationsLoading,
    isBenchmarksLoading,
    projectError,
    page,
    rowsPerPage,
    sortBy,
    sortOrder,
    handlePageChange,
    handleRowsPerPageChange,
    handleSort
  } = useProjectDashboard(id, resolveProjectTab(requestedTab, true));

  // Settings is for managers only: without that permission a request for it opens the overview.
  const tab: ProjectTabKey = resolveProjectTab(requestedTab, project?.permissions.manage ?? false);

  usePageTitle(project ? `${project.name} - Vision` : 'Project - Vision');

  // So it is one of the places the search box offers next time.
  useTrackVisit(
    project ? { kind: 'project', id: project._id, name: project.name, path: `/projects/${project.slug || project._id}` } : null
  );

  const handleTabChange = (next: ProjectTabKey) => setSearchParams({ tab: next });

  const deleteProjectMutation = useMutation({
    mutationFn: () => {
      if (!id) throw new Error('No project id');
      return projectService.deleteProject(id);
    },
    onSuccess: () => {
      setDeleteDialogOpen(false);
      queryClient.removeQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
    onError: (error) => {
      console.error('Failed to delete project:', error);
    }
  });

  const handleDeleteProject = () => {
    if (!id) return;
    deleteProjectMutation.mutate();
  };

  // Only the project itself holds the page back: its totals arrive after the header, the readme and the tabs.
  if (isProjectLoading) {
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

  return (
    <TaxonomyProvider taxonomy={project.taxonomy}>
      <CostingProvider costing={project.costing}>
        <Container maxWidth="xl" sx={{ mt: 0, mb: 8 }}>
          {/* Breadcrumbs */}
          <PageBreadcrumbs
            items={[
              { label: 'Projects', href: '/projects' },
              { label: project.name, current: true }
            ]}
          />

          <ProjectHeader project={project} />

          <CitedInPapers projectId={project._id} />

          <ProjectTabs
            tab={tab}
            onTabChange={handleTabChange}
            isStatsLoading={isStatsLoading || isDashboardStatsLoading}
            onMoveToTrash={() => setDeleteDialogOpen(true)}
            canManage={project.permissions.manage}
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
            evaluationsResponse={evaluations}
            isEvaluationsLoading={isEvaluationsLoading}
            benchmarksResponse={benchmarks}
            isBenchmarksLoading={isBenchmarksLoading}
            project={project}
          />

          <DeleteProjectDialog
            open={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            onConfirm={handleDeleteProject}
            isDeleting={deleteProjectMutation.isPending}
            error={deleteProjectMutation.error?.message}
          />
        </Container>
      </CostingProvider>
    </TaxonomyProvider>
  );
};

export default ProjectDashboardPage;
