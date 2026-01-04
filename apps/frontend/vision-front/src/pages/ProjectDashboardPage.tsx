import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Container,
  Typography,
  Button,
  Tab,
  Tabs,
  CircularProgress,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  IconButton,
  Chip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

import { projectService } from '../services/projectService';
import { formatDateTime } from '../utils';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { visualizationService } from '../services/visualizationService';
import { benchmarkService } from '../services/benchmarkService';
import ProjectSettings from '../components/ProjectSettings';
import { useAuth } from '../contexts/AuthContext';

// New Tab Components
import ProjectOverviewTab from '../components/project/ProjectOverviewTab';
import ProjectTrainingsTab from '../components/project/ProjectTrainingsTab';
import ProjectTestsTab from '../components/project/ProjectTestsTab';
import ProjectVisualizationsTab from '../components/project/ProjectVisualizationsTab';
import ProjectBenchmarksTab from '../components/project/ProjectBenchmarksTab';
import ProjectComparisonsTab from '../components/project/ProjectComparisonsTab';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`project-tabpanel-${index}`}
      aria-labelledby={`project-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ py: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ProjectDashboardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [searchParams] = useSearchParams();

  const tabNameToIndex: Record<string, number> = {
    overview: 0,
    trainings: 1,
    tests: 2,
    visualizations: 3,
    benchmarks: 4,
    comparisons: 5,
    settings: 6
  };

  React.useEffect(() => {
    const tabQuery = searchParams.get('tab');
    if (tabQuery && tabNameToIndex[tabQuery] !== undefined) {
      setTabValue(tabNameToIndex[tabQuery]);
    }
  }, [searchParams]);

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

  // Dialog states
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    isPublic: false
  });
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { 
    data: projectResponse, 
    isLoading: isProjectLoading, 
    error: projectError 
  } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectService.getProjectById(id!),
    enabled: !!id
  });

  const { 
    data: statsResponse, 
    isLoading: isStatsLoading 
  } = useQuery({
    queryKey: ['project-stats', id],
    queryFn: () => trainingService.getTrainingStats({ projectId: id }),
    enabled: !!id
  });

  // Dashboard stats for overview tab (includes all counts)
  const { 
    data: dashboardStatsResponse, 
    isLoading: isDashboardStatsLoading 
  } = useQuery({
    queryKey: ['project-dashboard-stats', id],
    queryFn: () => projectService.getProjectDashboardStats(id!),
    enabled: !!id
  });

  // Full trainings list for Trainings tab
  const { 
    data: fullTrainingsResponse, 
    isLoading: isFullTrainingsLoading
  } = useQuery({
    queryKey: ['project-trainings-full', id, page, rowsPerPage, sortBy, sortOrder],
    queryFn: () => trainingService.getTrainings({ 
      projectId: id, 
      page: page + 1, 
      limit: rowsPerPage,
      sortBy,
      order: sortOrder
    }),
    enabled: !!id && tabValue === 1
  });

  // Test results for Tests tab
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

  // Visualizations for Visualizations tab
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

  // Benchmarks for Benchmarks tab
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

  // Extract stats for display
  const stats = statsResponse?.data;
  const dashboardStats = dashboardStatsResponse?.data;

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  // Project edit/delete handlers
  const handleEditProject = () => {
    if (projectResponse?.data) {
      setEditFormData({
        name: projectResponse.data.name,
        description: projectResponse.data.description || '',
        isPublic: projectResponse.data.isPublic
      });
      setEditDialogOpen(true);
    }
  };

  const handleUpdateProject = async () => {
    if (!id) return;
    
    try {
      setIsUpdating(true);
      await projectService.updateProject(id, editFormData);
      setEditDialogOpen(false);
      // Invalidate project queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard-stats', id] });
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!id) return;
    
    try {
      setIsDeleting(true);
      await projectService.deleteProject(id);
      setDeleteDialogOpen(false);
      navigate('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Pagination handlers for Tests tab
  const handleTestsPageChange = (_event: unknown, newPage: number) => {
    setTestsPage(newPage);
  };

  const handleTestsRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTestsRowsPerPage(parseInt(event.target.value, 10));
    setTestsPage(0);
  };

  // Pagination handlers for Benchmarks tab
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

  if (isProjectLoading || isStatsLoading || (tabValue === 0 && isDashboardStatsLoading)) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (projectError || !projectResponse?.data) {
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

  const project = projectResponse.data;
  const isOwner = user?.id === project.ownerId;

  return (
    <Container maxWidth="xl" sx={{ mt: 0, mb: 8 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/projects')} 
          sx={{ mb: 2, color: 'text.secondary' }}
        >
          Back to Projects
        </Button>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h3" component="h1" gutterBottom fontWeight="bold">
              {project.name}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800, mb: 2 }}>
              {project.description || 'No description provided.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Chip 
                label={project.isPublic ? 'Public' : 'Private'} 
                color={project.isPublic ? 'success' : 'default'} 
                variant="outlined" 
                size="small" 
              />
              <Chip 
                label={`Created ${formatDateTime(project.createdAt)}`} 
                variant="outlined" 
                size="small" 
              />
            </Box>
          </Box>
          
          {isOwner && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <IconButton 
                color="primary"
                onClick={handleEditProject}
                size="small"
              >
                <EditIcon />
              </IconButton>
              <IconButton 
                color="error"
                onClick={() => setDeleteDialogOpen(true)}
                size="small"
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          )}
        </Box>
      </Box>

      {/* Tabs */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="project tabs">
            <Tab label="Overview" />
            <Tab label="Trainings" />
            <Tab label="Tests" />
            <Tab label="Visualizations" />
            <Tab label="Benchmarks" />
            <Tab label="Comparisons" />
            {isOwner && <Tab label="Settings" />}
          </Tabs>
        </Box>

        {/* Overview Tab */}
        <TabPanel value={tabValue} index={0}>
          <ProjectOverviewTab 
            stats={stats} 
            dashboardStats={dashboardStats} 
            isAuthenticated={isAuthenticated} 
            user={user} 
          />
        </TabPanel>

        {/* Trainings Tab */}
        <TabPanel value={tabValue} index={1}>
          <ProjectTrainingsTab
            projectId={id!}
            trainings={fullTrainingsResponse?.data?.trainings || []}
            isLoading={isFullTrainingsLoading}
            page={page}
            rowsPerPage={rowsPerPage}
            total={fullTrainingsResponse?.data?.pagination.total || 0}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            isAuthenticated={isAuthenticated}
          />
        </TabPanel>

        {/* Tests Tab */}
        <TabPanel value={tabValue} index={2}>
          <ProjectTestsTab
            testResultsResponse={testResultsResponse}
            isLoading={isTestResultsLoading}
            page={testsPage}
            rowsPerPage={testsRowsPerPage}
            onPageChange={handleTestsPageChange}
            onRowsPerPageChange={handleTestsRowsPerPageChange}
          />
        </TabPanel>

        {/* Visualizations Tab */}
        <TabPanel value={tabValue} index={3}>
          <ProjectVisualizationsTab
            visualizationsResponse={visualizationsResponse}
            isLoading={isVisualizationsLoading}
          />
        </TabPanel>

        {/* Benchmarks Tab */}
        <TabPanel value={tabValue} index={4}>
          <ProjectBenchmarksTab
            benchmarksResponse={benchmarksResponse}
            isLoading={isBenchmarksLoading}
            page={benchmarksPage}
            rowsPerPage={benchmarksRowsPerPage}
            onPageChange={handleBenchmarksPageChange}
            onRowsPerPageChange={handleBenchmarksRowsPerPageChange}
          />
        </TabPanel>

        {/* Comparisons Tab */}
        <TabPanel value={tabValue} index={5}>
          <ProjectComparisonsTab projectId={id!} />
        </TabPanel>

        {/* Settings Tab */}
        {isOwner && (
          <TabPanel value={tabValue} index={6}>
            <Box sx={{ px: 3 }}>
              <ProjectSettings project={project} />
            </Box>
          </TabPanel>
        )}
      </Paper>

      {/* Edit Project Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Project</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Project Name"
              value={editFormData.name}
              onChange={(e) => setEditFormData(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={editFormData.description}
              onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))}
              fullWidth
              multiline
              rows={3}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={editFormData.isPublic}
                  onChange={(e) => setEditFormData(prev => ({ ...prev, isPublic: e.target.checked }))}
                />
              }
              label="Public project"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleUpdateProject} 
            variant="contained"
            disabled={isUpdating || !editFormData.name.trim()}
          >
            {isUpdating ? 'Updating...' : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Project Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this project? This action cannot be undone.
            All trainings, visualizations, and data associated with this project will be permanently removed.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteProject} 
            color="error" 
            variant="contained"
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ProjectDashboardPage;
