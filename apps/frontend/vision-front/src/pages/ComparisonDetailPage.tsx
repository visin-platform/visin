import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { usePageTitle } from '../hooks/usePageTitle';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import IoUMetricsTable from '../components/test-results/IoUMetricsTable';
import APMetricsTable from '../components/test-results/APMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DeleteComparisonDialog from '../components/comparisons/DeleteComparisonDialog';
import TrainingSelector from '../components/comparison/TrainingSelector';

const ComparisonDetailPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Set page title
  usePageTitle('Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // State for edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  // State for delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Fetch comparison by UUID
  const {
    data: comparisonResponse,
    isLoading: isComparisonLoading,
    error: comparisonError
  } = useQuery({
    queryKey: ['comparison', uuid],
    queryFn: () => comparisonService.getComparisonByUuid(uuid!),
    enabled: !!uuid
  });

  const comparison = comparisonResponse?.data;

  // Fetch trainings for the edit modal
  const { data: trainingsResponse, isLoading: isTrainingsLoading } = useQuery({
    queryKey: ['trainings-for-edit', comparison?.projectId],
    queryFn: () => trainingService.getTrainings({ projectId: comparison!.projectId!, limit: 1000 }),
    enabled: !!comparison?.projectId && editDialogOpen
  });

  const trainings = trainingsResponse?.data?.trainings || [];

  // Fetch project data if we have comparison
  const {
    data: projectResponse,
    isLoading: isProjectLoading
  } = useQuery({
    queryKey: ['project', comparison?.projectId],
    queryFn: () => projectService.getProjectById(comparison!.projectId!),
    enabled: !!comparison?.projectId
  });

  const project = projectResponse?.data;

  // Fetch training comparison data
  const {
    data: trainingComparisonResponse,
    isLoading: isTrainingComparisonLoading,
    error: trainingComparisonError
  } = useQuery({
    queryKey: ['trainingComparison', comparison?.itemIds],
    queryFn: () => trainingService.compareTrainings(comparison!.itemIds),
    enabled: !!comparison?.itemIds && comparison.itemIds.length > 0
  });

  const comparisonData = trainingComparisonResponse?.data?.comparison || [];

  // Handler functions
  const handleEditComparison = async () => {
    if (!comparison) return;

    setEditName(comparison.name);
    setEditDescription(comparison.description || '');
    setEditSelectedIds(comparison.itemIds);
    setEditDialogOpen(true);
  };

  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditSelectedIds([]);
  };

  const handleUpdateComparison = async () => {
    if (!comparison || !editName.trim()) return;

    try {
      setUpdating(true);
      await comparisonService.updateComparison(comparison._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        itemIds: editSelectedIds,
      });

      // Invalidate and refetch the comparison data
      queryClient.invalidateQueries({ queryKey: ['comparison', uuid] });
      
      setEditDialogOpen(false);
      setEditName('');
      setEditDescription('');
      setEditSelectedIds([]);
    } catch (error) {
      console.error('Error updating comparison:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleEditTrainingIdToggle = (trainingId: string) => {
    setEditSelectedIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  const handleDeleteComparison = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!comparison) return;

    try {
      await comparisonService.deleteComparison(comparison._id);
      // Navigate back to project or comparisons page
      if (project) {
        navigate(`/projects/${project.slug || project._id}`);
      } else {
        navigate('/comparisons');
      }
    } catch (error) {
      console.error('Error deleting comparison:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
  };

  // Helper function to format dates as DD.MM.YYYY
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  // Process test results data - use the already aggregated data from backend
  const testResultsData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    return comparisonData
      .filter(comp => comp.aggregatedTestResults !== null)
      .map(comp => ({
        aggregatedResults: comp.aggregatedTestResults,
        training: comp.training,
        testResultsCount: comp.testResultsCount || 0
      }));
  }, [comparisonData]);

  // Process benchmarks data
  const benchmarksData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    const allBenchmarks = comparisonData.flatMap(comp =>
      comp.benchmarks.map((benchmark: any) => ({
        ...benchmark,
        training_name: comp.training.name
      }))
    );

    return allBenchmarks;
  }, [comparisonData]);

  const isLoading = isComparisonLoading || isProjectLoading || isTrainingComparisonLoading;
  const error = comparisonError || trainingComparisonError;

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading comparison...
        </Typography>
      </Container>
    );
  }

  if (error || !comparison) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load comparison. It may not exist or you don't have permission to view it.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          ...(project ? [{ label: project.name, href: `/projects/${project.slug || project._id}` }] : []),
          { label: comparison.name, current: true }
        ]}
      />

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {comparison.name}
            </Typography>

            {comparison.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {comparison.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Edit Comparison">
              <IconButton
                onClick={handleEditComparison}
                color="primary"
                sx={{ 
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Comparison">
              <IconButton
                onClick={handleDeleteComparison}
                color="error"
                sx={{ 
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary">
          Created: {formatDate(comparison.createdAt)}
          {comparison.updatedAt !== comparison.createdAt && (
            <> • Updated: {formatDate(comparison.updatedAt)}</>
          )}
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Training Metrics" />
          <Tab label="Test Results" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Training Metrics Comparison
          </Typography>
          {comparisonData.length > 0 ? (
            <ComparisonTable comparisonData={comparisonData} />
          ) : (
            <Alert severity="info">No training data available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Test Results Comparison
          </Typography>
          {testResultsData.length > 0 ? (
            <>
              <PerformanceMetricsTable comparisonData={testResultsData} />
              <Box sx={{ mt: 4 }}>
                <IoUMetricsTable comparisonData={testResultsData} />
              </Box>
              <Box sx={{ mt: 4 }}>
                <APMetricsTable comparisonData={testResultsData} />
              </Box>
            </>
          ) : (
            <Alert severity="info">No test results available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Benchmarks Comparison
          </Typography>
          {benchmarksData.length > 0 ? (
            <BenchmarksComparisonTable benchmarks={benchmarksData} />
          ) : (
            <Alert severity="info">No benchmark data available for comparison.</Alert>
          )}
        </Box>
      )}
      
      {/* Edit Comparison Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCancelEdit} maxWidth="md" fullWidth>
        <DialogTitle>Edit Comparison</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Comparison Title"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline
              rows={2}
              sx={{ mb: 3 }}
            />

            <Typography variant="h6" sx={{ mb: 2 }}>
              Select Trainings
            </Typography>

            <TrainingSelector
              trainings={trainings}
              selectedTrainingIds={editSelectedIds}
              onTrainingToggle={handleEditTrainingIdToggle}
              maxSelections={20}
              isLoading={isTrainingsLoading}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEdit}>Cancel</Button>
          <Button 
            onClick={handleUpdateComparison} 
            variant="contained"
            disabled={!editName.trim() || editSelectedIds.length === 0 || updating}
          >
            {updating ? <CircularProgress size={20} /> : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteComparisonDialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />
    </Container>
  );
};

export default ComparisonDetailPage;