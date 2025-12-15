import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  Button,
  Tab,
  Tabs,
  CircularProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Switch,
  IconButton
} from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Timeline as TimelineIcon,
  AttachMoney as CostIcon,
  AccessTime as TimeIcon,
  Speed as SpeedIcon,
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Compare as CompareIcon,
  Assessment as AssessmentIcon,
  Image as ImageIcon,
  BarChart as BarChartIcon
} from '@mui/icons-material';
import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
import { testResultService } from '../services/testResultService';
import { visualizationService } from '../services/visualizationService';
import { benchmarkService } from '../services/benchmarkService';
import { configService } from '../services/configService';
import { getAllAnalyses, type DatasetAnalysis } from '../services/analysisService';
import TrainingFormDialog from '../components/TrainingFormDialog';
import TrainingsTable from '../components/TrainingsTable';
import ProjectSettings from '../components/ProjectSettings';
import { useAuth } from '../contexts/AuthContext';
import { Training } from '../types';

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
    settings: 5
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
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<string>>(new Set());

  // Selected test result IDs for comparison
  const [selectedTestResultIds, setSelectedTestResultIds] = useState<Set<string>>(new Set());

  // Selected training IDs for visualization comparison
  const [selectedVisualizationTrainingIds, setSelectedVisualizationTrainingIds] = useState<Set<string>>(new Set());

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

  // Training edit/delete modal state (for Trainings tab actions)
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [trainingName, setTrainingName] = useState('');
  const [trainingDescription, setTrainingDescription] = useState('');
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [trainingTags, setTrainingTags] = useState<string[]>([]);
  const [datasets, setDatasets] = useState<DatasetAnalysis[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(false);
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingError, setTrainingError] = useState<string | null>(null);
  const [trainingSuccess, setTrainingSuccess] = useState<string | null>(null);
  const [deleteTrainingDialogOpen, setDeleteTrainingDialogOpen] = useState(false);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);

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
    // Clear selections when switching tabs
    if (newValue !== 2) {
      setSelectedTestResultIds(new Set());
    }
    if (newValue !== 3) {
      setSelectedVisualizationTrainingIds(new Set());
    }
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

  const handleSelectTraining = (trainingId: string) => {
    const newSelected = new Set(selectedTrainingIds);
    if (newSelected.has(trainingId)) {
      newSelected.delete(trainingId);
    } else {
      newSelected.add(trainingId);
    }
    setSelectedTrainingIds(newSelected);
  };

  const handleSelectAll = () => {
    if (fullTrainingsResponse?.data?.trainings && selectedTrainingIds.size === fullTrainingsResponse.data.trainings.length) {
      setSelectedTrainingIds(new Set());
    } else {
      const allIds = new Set<string>(fullTrainingsResponse?.data?.trainings.map((t: Training) => t._id) || []);
      setSelectedTrainingIds(allIds);
    }
  };

  // Trainings tab: edit training
  const handleEditTraining = async (training: Training) => {
    try {
      setLoadingConfigs(true);
      setLoadingDatasets(true);
      setLoadingProjects(true);

      const [configsRes, analysesRes, projectsRes] = await Promise.all([
        configService.getAllConfigs(),
        getAllAnalyses(100, 0),
        projectService.getProjects()
      ]);

      setConfigs(configsRes.data.configs || []);
      setDatasets(analysesRes.data || []);
      setProjects(projectsRes.data || []);

      setEditingTrainingId(training._id);
      setTrainingName(training.name);
      setTrainingDescription(training.description || '');
      setSelectedDatasetId(training.datasetId || '');
      setSelectedConfigId(training.configId || '');
      setSelectedProjectId(training.projectId || '');
      setSelectedStatus(training.status);
      setTrainingTags(training.tags || []);
      setTrainingModalOpen(true);
    } catch (err) {
      console.error('Failed to load data for editing training:', err);
    } finally {
      setLoadingConfigs(false);
      setLoadingDatasets(false);
      setLoadingProjects(false);
    }
  };

  const handleSubmitTraining = async () => {
    if (!editingTrainingId) return;
    try {
      setSavingTraining(true);
      await trainingService.updateTraining(editingTrainingId, {
        name: trainingName,
        description: trainingDescription,
        datasetId: selectedDatasetId || undefined,
        configId: selectedConfigId || undefined,
        projectId: selectedProjectId || undefined,
        status: selectedStatus,
        tags: trainingTags
      });
      setTrainingSuccess('Training updated successfully');
      setTrainingModalOpen(false);
      setEditingTrainingId(null);
      // Refresh trainings list
      queryClient.invalidateQueries({ queryKey: ['project-trainings-full', id] });
    } catch (err) {
      console.error('Failed to update training:', err);
      setTrainingError(err instanceof Error ? err.message : 'Failed to update training');
    } finally {
      setSavingTraining(false);
    }
  };

  // Trainings tab: delete training
  const handleDeleteTrainingClick = (trainingId: string) => {
    setDeleteTrainingId(trainingId);
    setDeleteTrainingDialogOpen(true);
  };

  const handleConfirmDeleteTraining = async () => {
    if (!deleteTrainingId) return;
    try {
      setIsDeleting(true);
      await trainingService.deleteTraining(deleteTrainingId);
      setDeleteTrainingDialogOpen(false);
      setDeleteTrainingId(null);
      queryClient.invalidateQueries({ queryKey: ['project-trainings-full', id] });
    } catch (err) {
      console.error('Failed to delete training:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCompareSelected = () => {
    const selectedIds = Array.from(selectedTrainingIds);
    if (selectedIds.length > 1) {
      navigate(`/trainings/compare?ids=${selectedIds.join(',')}`);
    }
  };

  // Test result selection handlers
  const handleSelectTestResult = (testResultId: string) => {
    const newSelected = new Set(selectedTestResultIds);
    if (newSelected.has(testResultId)) {
      newSelected.delete(testResultId);
    } else {
      newSelected.add(testResultId);
    }
    setSelectedTestResultIds(newSelected);
  };

  const handleSelectAllTestResults = () => {
    if (testResultsResponse?.data?.testResults && selectedTestResultIds.size === testResultsResponse.data.testResults.length) {
      setSelectedTestResultIds(new Set());
    } else {
      const allIds = new Set<string>(testResultsResponse?.data?.testResults.map((tr: any) => tr._id) || []);
      setSelectedTestResultIds(allIds);
    }
  };

  const handleCompareSelectedTestResults = () => {
    const selectedIds = Array.from(selectedTestResultIds);
    if (selectedIds.length > 1) {
      navigate(`/test-results/compare?ids=${selectedIds.join(',')}`);
    }
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
      <Container maxWidth="xl" sx={{ mt: 4 }}>
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

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const formatCost = (cost: number) => {
    return `${cost.toFixed(2)}€`;
  };

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 8 }}>
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
                label={`Created ${new Date(project.createdAt).toLocaleDateString('et-EE')}`} 
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
            {isOwner && <Tab label="Settings" />}
          </Tabs>
        </Box>

        {/* Overview Tab */}
        <TabPanel value={tabValue} index={0}>
          {/* Stats Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'primary.light', color: 'primary.main', mr: 2 }}>
                      <TimelineIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Trainings
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats?.totalTrainings || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'info.light', color: 'info.main', mr: 2 }}>
                      <TimeIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Training Time
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {formatTime(stats?.totalTime || 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'warning.light', color: 'warning.main', mr: 2 }}>
                      <CostIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Total Cost
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {formatCost(stats?.totalCost || 0)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'success.light', color: 'success.main', mr: 2 }}>
                      <SpeedIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Avg. Epoch Time
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {stats?.avgEpochTime ? formatTime(stats.avgEpochTime) : '-'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'secondary.light', color: 'secondary.main', mr: 2 }}>
                      <AssessmentIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Test Results
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {dashboardStats?.testResultsCount || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'error.light', color: 'error.main', mr: 2 }}>
                      <ImageIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Visualizations
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {dashboardStats?.visualizationsCount || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'orange.light', color: 'orange.main', mr: 2 }}>
                      <BarChartIcon />
                    </Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      Benchmarks
                    </Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {dashboardStats?.benchmarksCount || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {!isAuthenticated && (
            <Box sx={{ px: 3, py: 4 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" gutterBottom>
                  Project Overview
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Monitor your machine learning project's progress and results.
                </Typography>
                {user && (
                  <Button 
                    variant="contained" 
                    startIcon={<AddIcon />}
                    onClick={() => navigate('/trainings')}
                    size="large"
                  >
                    Start New Training
                  </Button>
                )}
              </Box>
            </Box>
          )}
        </TabPanel>

        {/* Trainings Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
              {selectedTrainingIds.size > 1 && (
                <Button
                  variant="outlined"
                  startIcon={<CompareIcon />}
                  onClick={handleCompareSelected}
                  color="primary"
                  size="small"
                  sx={{ borderRadius: 2 }}
                >
                  Compare Selected ({selectedTrainingIds.size})
                </Button>
              )}
            </Box>
            <TrainingsTable 
              trainings={fullTrainingsResponse?.data?.trainings || []} 
              isLoading={isFullTrainingsLoading}
              page={page}
              rowsPerPage={rowsPerPage}
              total={fullTrainingsResponse?.data?.pagination.total || 0}
              onPageChange={handlePageChange}
              onRowsPerPageChange={handleRowsPerPageChange}
              onEdit={handleEditTraining}
              onDelete={handleDeleteTrainingClick}
              searchTerm=""
              selectedTrainingIds={selectedTrainingIds}
              onSelectTraining={handleSelectTraining}
              onSelectAll={handleSelectAll}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              isAuthenticated={isAuthenticated}
            />
          </Box>
        </TabPanel>

        {/* Tests Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
              {selectedTestResultIds.size > 1 && (
                <Button
                  variant="outlined"
                  startIcon={<CompareIcon />}
                  onClick={handleCompareSelectedTestResults}
                  color="primary"
                  size="small"
                  sx={{ borderRadius: 2 }}
                >
                  Compare Selected ({selectedTestResultIds.size})
                </Button>
              )}
            </Box>
            <Typography variant="h6" gutterBottom>Test Results</Typography>
            {isTestResultsLoading ? (
              <CircularProgress />
            ) : testResultsResponse?.data?.testResults && testResultsResponse.data.testResults.length > 0 ? (
              <>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={selectedTestResultIds.size > 0 && selectedTestResultIds.size < (testResultsResponse?.data?.testResults?.length || 0)}
                            checked={testResultsResponse?.data?.testResults && selectedTestResultIds.size === testResultsResponse.data.testResults.length}
                            onChange={handleSelectAllTestResults}
                          />
                        </TableCell>
                        <TableCell>Training</TableCell>
                        <TableCell>Epoch</TableCell>
                        <TableCell>Timestamp</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {testResultsResponse.data.testResults.map((testResult: any) => (
                        <TableRow key={testResult._id}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedTestResultIds.has(testResult._id)}
                              onChange={() => handleSelectTestResult(testResult._id)}
                            />
                          </TableCell>
                          <TableCell>{testResult.training?.name || 'Unknown'}</TableCell>
                          <TableCell>{testResult.epoch}</TableCell>
                          <TableCell>{new Date(testResult.timestamp).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <TablePagination
                    component="div"
                    count={testResultsResponse?.data?.pagination?.total || 0}
                    page={testsPage}
                    onPageChange={handleTestsPageChange}
                    rowsPerPage={testsRowsPerPage}
                    onRowsPerPageChange={handleTestsRowsPerPageChange}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                  />
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No test results found for this project.
              </Typography>
            )}
          </Box>
        </TabPanel>

        {/* Visualizations Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Visualizations</Typography>
              {selectedVisualizationTrainingIds.size > 0 && (
                <Button
                  variant="contained"
                  startIcon={<CompareIcon />}
                  onClick={() => {
                    const selectedIds = Array.from(selectedVisualizationTrainingIds);
                    navigate(`/visualizations/compare-trainings?ids=${selectedIds.join(',')}`);
                  }}
                >
                  Compare Selected ({selectedVisualizationTrainingIds.size})
                </Button>
              )}
            </Box>
            {isVisualizationsLoading ? (
              <CircularProgress />
            ) : visualizationsResponse?.data?.trainings && visualizationsResponse.data.trainings.length > 0 ? (
              <>
                {visualizationsResponse.data.trainings.map((training: any) => (
                  <Card key={training.training_uuid} sx={{ mb: 3 }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                        <Checkbox
                          checked={selectedVisualizationTrainingIds.has(training.training_uuid)}
                          onChange={(e) => {
                            const newSelected = new Set(selectedVisualizationTrainingIds);
                            if (e.target.checked) {
                              newSelected.add(training.training_uuid);
                            } else {
                              newSelected.delete(training.training_uuid);
                            }
                            setSelectedVisualizationTrainingIds(newSelected);
                          }}
                        />
                        <Typography variant="h6" sx={{ ml: 1 }}>
                          {training.training_name}
                        </Typography>
                        <Chip
                          label={`${training.visualizations.length} visualization${training.visualizations.length !== 1 ? 's' : ''}`}
                          size="small"
                          sx={{ ml: 2 }}
                        />
                      </Box>
                      {training.visualizations.length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                          {(() => {
                            const typeCounts = training.visualizations.reduce((acc: { [key: string]: number }, viz: any) => {
                              acc[viz.type] = (acc[viz.type] || 0) + 1;
                              return acc;
                            }, {});
                            return Object.entries(typeCounts).map(([type, count]) => (
                              <Chip
                                key={type}
                                label={`${type}: ${count}`}
                                size="small"
                                variant="outlined"
                              />
                            ));
                          })()}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No visualizations for this training.
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No visualizations found for this project.
              </Typography>
            )}
          </Box>
        </TabPanel>

        {/* Benchmarks Tab */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ px: 3 }}>
            <Typography variant="h6" gutterBottom>Benchmarks</Typography>
            {isBenchmarksLoading ? (
              <CircularProgress />
            ) : benchmarksResponse?.data?.benchmarks && benchmarksResponse.data.benchmarks.length > 0 ? (
              <>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Training</TableCell>
                        <TableCell>FPS</TableCell>
                        <TableCell>Parameters</TableCell>
                        <TableCell>Timestamp</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {benchmarksResponse.data.benchmarks.map((benchmark: any) => {
                        const firstResult = benchmark.results && benchmark.results.length > 0 ? benchmark.results[0] : null;

                        const formatParameters = (res: any) => {
                          if (!res) return '-';
                          // Prefer explicit million field if present
                          if (res.total_parameters_m !== undefined && res.total_parameters_m !== null) {
                            return `${Number(res.total_parameters_m).toFixed(1)}M`;
                          }
                          const paramVal = res.parameters ?? res.total_parameters ?? res.trainable_parameters;
                          if (paramVal !== undefined && paramVal !== null) {
                            const num = Number(paramVal);
                            if (Number.isFinite(num)) return `${(num / 1e6).toFixed(1)}M`;
                          }
                          return '-';
                        };

                        // Determine training link id (prefer object _id)
                        const trainingObj = benchmark.training_id && typeof benchmark.training_id === 'object' ? benchmark.training_id : null;
                        const trainingId = trainingObj?._id || null;
                        const trainingName = trainingObj?.name || benchmark.training_name || 'Unknown';

                        return (
                          <TableRow key={benchmark._id}>
                            <TableCell>
                              {trainingId ? (
                                <Link to={`/trainings/${trainingId}?tab=benchmarks`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                  <Typography variant="body2" color="primary" fontWeight={500}>
                                    {trainingName}
                                  </Typography>
                                </Link>
                              ) : (
                                <Typography variant="body2">{trainingName}</Typography>
                              )}
                            </TableCell>
                            <TableCell>{firstResult?.fps !== undefined && firstResult?.fps !== null ? firstResult.fps.toFixed(2) : '-'}</TableCell>
                            <TableCell>{formatParameters(firstResult)}</TableCell>
                            <TableCell>{new Date(benchmark.timestamp).toLocaleString()}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <TablePagination
                    component="div"
                    count={benchmarksResponse?.data?.pagination?.total || 0}
                    page={benchmarksPage}
                    onPageChange={handleBenchmarksPageChange}
                    rowsPerPage={benchmarksRowsPerPage}
                    onRowsPerPageChange={handleBenchmarksRowsPerPageChange}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                  />
                </Box>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No benchmarks found for this project.
              </Typography>
            )}
          </Box>
        </TabPanel>

        {/* Settings Tab */}
        {isOwner && (
          <TabPanel value={tabValue} index={5}>
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

      {/* Edit Training Dialog (used in Trainings tab) */}
      <TrainingFormDialog
        open={trainingModalOpen}
        onClose={() => {
          setTrainingModalOpen(false);
          setEditingTrainingId(null);
          setTrainingName('');
          setTrainingDescription('');
          setSelectedDatasetId('');
          setSelectedConfigId('');
          setSelectedProjectId('');
          setSelectedStatus('pending');
          setTrainingTags([]);
          setTrainingError(null);
          setTrainingSuccess(null);
        }}
        onSubmit={handleSubmitTraining}
        isEditing={!!editingTrainingId}
        isCreating={savingTraining}
        isLoadingData={loadingConfigs || loadingDatasets || loadingProjects}
        trainingName={trainingName}
        onNameChange={setTrainingName}
        trainingDescription={trainingDescription}
        onDescriptionChange={setTrainingDescription}
        selectedConfigId={selectedConfigId}
        onConfigChange={setSelectedConfigId}
        selectedDatasetId={selectedDatasetId}
        onDatasetChange={setSelectedDatasetId}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        trainingTags={trainingTags}
        onTagsChange={setTrainingTags}
        availableTags={[]}
        configs={configs}
        datasets={datasets}
        projects={projects}
        error={trainingError}
        success={trainingSuccess}
        loadingConfigs={loadingConfigs}
        loadingDatasets={loadingDatasets}
        loadingProjects={loadingProjects}
      />

      {/* Delete Training Dialog */}
      <Dialog open={deleteTrainingDialogOpen} onClose={() => setDeleteTrainingDialogOpen(false)}>
        <DialogTitle>Delete Training</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this training? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTrainingDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleConfirmDeleteTraining}
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
