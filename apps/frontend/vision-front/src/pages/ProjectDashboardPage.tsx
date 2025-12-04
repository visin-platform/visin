import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  Paper
} from '@mui/material';
import {
  Timeline as TimelineIcon,
  AttachMoney as CostIcon,
  AccessTime as TimeIcon,
  Speed as SpeedIcon,
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
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
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);

  // Table state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'>('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedTrainingIds, setSelectedTrainingIds] = useState<Set<string>>(new Set());

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

  // Recent trainings for Overview
  const { 
    data: recentTrainingsResponse, 
    isLoading: isRecentTrainingsLoading 
  } = useQuery({
    queryKey: ['project-trainings-recent', id],
    queryFn: () => trainingService.getTrainings({ projectId: id, limit: 5, sortBy: 'updatedAt', order: 'desc' }),
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

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handlePageChange = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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

  if (isProjectLoading || isStatsLoading) {
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
  const stats = statsResponse?.data;
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
            <Box>
              <Button 
                variant="outlined" 
                startIcon={<EditIcon />} 
                sx={{ mr: 1 }}
                onClick={() => {/* TODO: Open edit dialog */}}
              >
                Edit
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                startIcon={<DeleteIcon />}
                onClick={() => {/* TODO: Open delete dialog */}}
              >
                Delete
              </Button>
            </Box>
          )}
        </Box>
      </Box>

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
                {/* Placeholder for avg epoch time if available, or another metric */}
                -
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h6">Recent Trainings</Typography>
              {user && (
                <Button 
                  variant="contained" 
                  startIcon={<AddIcon />}
                  onClick={() => navigate('/trainings')} // Or open create dialog with project pre-selected
                >
                  New Training
                </Button>
              )}
            </Box>
            
            {recentTrainingsResponse?.data?.trainings && recentTrainingsResponse.data.trainings.length > 0 ? (
              <TrainingsTable 
                trainings={recentTrainingsResponse.data.trainings} 
                isLoading={isRecentTrainingsLoading}
                page={0}
                rowsPerPage={5}
                total={recentTrainingsResponse.data.pagination.total}
                onPageChange={() => {}}
                onRowsPerPageChange={() => {}}
                onEdit={() => {}}
                onDelete={() => {}}
                searchTerm=""
                selectedTrainingIds={new Set()}
                onSelectTraining={() => {}}
                onSelectAll={() => {}}
                sortBy="updatedAt"
                sortOrder="desc"
                onSort={() => {}}
              />
            ) : (
              <Box sx={{ textAlign: 'center', py: 8, bgcolor: 'background.default', borderRadius: 2 }}>
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No trainings found
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Get started by creating your first training for this project.
                </Typography>
                {user && (
                  <Button variant="contained" startIcon={<AddIcon />}>
                    Create Training
                  </Button>
                )}
              </Box>
            )}
          </Box>
        </TabPanel>

        {/* Trainings Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ px: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
              {user && (
                <Button 
                  variant="contained" 
                  startIcon={<AddIcon />}
                  onClick={() => navigate('/trainings')}
                >
                  New Training
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
              onEdit={() => {}} // TODO: Implement edit
              onDelete={() => {}} // TODO: Implement delete
              searchTerm=""
              selectedTrainingIds={selectedTrainingIds}
              onSelectTraining={handleSelectTraining}
              onSelectAll={handleSelectAll}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
            />
          </Box>
        </TabPanel>

        {/* Tests Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ px: 3 }}>
            <Typography variant="body1" color="text.secondary">
              Test results associated with this project's trainings will appear here.
            </Typography>
          </Box>
        </TabPanel>

        {/* Visualizations Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ px: 3 }}>
            <Typography variant="body1" color="text.secondary">
              Visualizations for this project will appear here.
            </Typography>
          </Box>
        </TabPanel>

        {/* Benchmarks Tab */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{ px: 3 }}>
            <Typography variant="body1" color="text.secondary">
              Benchmarks for this project will appear here.
            </Typography>
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
    </Container>
  );
};

export default ProjectDashboardPage;
