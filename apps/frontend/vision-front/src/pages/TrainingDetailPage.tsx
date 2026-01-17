import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Button,
  Tabs,
  Tab,
  Chip,
  Stack
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

import { trainingService } from '../services/trainingService';
import { epochService } from '../services/epochService';
import { testResultService } from '../services/testResultService';
import { Epoch, TestResult } from '../types';

import TrainingOverviewTab from '../components/TrainingOverviewTab';
import TrainingEpochsTab from '../components/TrainingEpochsTab';
import TrainingTestResultsTab from '../components/TrainingTestResultsTab';
import TrainingConfigTab from '../components/TrainingConfigTab';
import TrainingVisualizationsTab from '../components/TrainingVisualizationsTab';
import TrainingSystemInfoTab from '../components/TrainingSystemInfoTab';
import TrainingBenchmarksTab from '../components/TrainingBenchmarksTab';
import TrainingFormDialog from '../components/TrainingFormDialog';

import StatusChip from '../components/training/StatusChip';
import UploadResultsDialog from '../components/training/UploadResultsDialog';
import LatexExportDialog from '../components/training/LatexExportDialog';
import DeleteConfirmationDialog from '../components/training/DeleteConfirmationDialog';

import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { useTrainingDetail } from '../hooks/useTrainingDetail';
import { useTrainingEdit } from '../hooks/useTrainingEdit';
import { processEpochFiles, processTestResultFiles, UploadResult } from '../utils/fileUploadHelpers';
import { generateLatexCode, generateAggregatedLatexCode } from '../utils/latexGenerator';

const TrainingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated } = useAuth();

  // Tab mapping
  const tabNames = ['overview', 'epochs', 'test-results', 'visualizations', 'system-info', 'config', 'benchmarks'];
  const getTabIndex = (tabName: string) => tabNames.indexOf(tabName);
  const getTabName = (index: number) => tabNames[index] || 'overview';

  // Initialize tab from URL or default to 0
  const initialTab = getTabIndex(searchParams.get('tab') || 'overview');
  const [detailTab, setDetailTab] = useState(initialTab >= 0 ? initialTab : 0);

  // State for uploads and deletes
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Epoch | null>(null);
  const [trainingDeleteOpen, setTrainingDeleteOpen] = useState(false);
  const [uploadResultsOpen, setUploadResultsOpen] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult>({ successful: [], failed: [] });
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');

  // Custom hooks
  const {
    training,
    epochs,
    isLoading,
    error,
    refetch,
    config,
    configLoading,
    allTestResults,
    testResultsLoading,
    availableTestEpochs,
    comments,
    commentsLoading,
    refetchComments
  } = useTrainingDetail(id);

  const {
    editDialogOpen,
    handleEditTraining,
    handleEditConfirm,
    handleEditCancel,
    editName, setEditName,
    editDescription, setEditDescription,
    editConfigId, setEditConfigId,
    editDatasetId, setEditDatasetId,
    editProjectId, setEditProjectId,
    editStatus, setEditStatus,
    editTags, setEditTags,
    availableTags,
    editConfigs,
    editDatasets,
    editProjects,
    editLoadingConfigs,
    editLoadingDatasets,
    editLoadingProjects,
    isUpdating,
    updateError,
    updateSuccess
  } = useTrainingEdit(training, refetch);

  // Set page title
  usePageTitle(training ? `${training.name} - Vision` : 'Training Details - Vision');

  // Handle tab change with URL update
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setDetailTab(newValue);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', getTabName(newValue));
    setSearchParams(newSearchParams, { replace: true });
  };

  // File upload handlers
  const handleFileUpload = async (files: FileList, type: 'epoch' | 'testResult') => {
    if (!files || files.length === 0 || !training) return;

    try {
      setUploading(true);
      setUploadError(null);
      setUploadSuccess(null);

      const results = type === 'epoch' 
        ? await processEpochFiles(files, training._id)
        : await processTestResultFiles(files);

      setUploadResults(results);

      if (results.successful.length > 0) {
        setUploadSuccess(`${results.successful.length} file(s) processed successfully`);
        refetch();
      }

      if (results.failed.length > 0) {
        setUploadError(`Failed to process ${results.failed.length} file(s)`);
      }

      setTimeout(() => {
        setUploadSuccess(null);
        setUploadError(null);
      }, 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload files';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  // Epoch delete handlers
  const handleDeleteClick = (epoch: Epoch) => {
    setDeleteTarget(epoch);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setUploading(true);
      await epochService.deleteEpoch(deleteTarget._id);
      setUploadSuccess('Epoch deleted successfully');
      refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete epoch';
      setUploadError(message);
    } finally {
      setUploading(false);
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  };

  // Training delete handlers
  const handleConfirmDeleteTraining = async () => {
    if (!training) return;

    try {
      setUploading(true);
      await trainingService.deleteTraining(training._id);
      setUploadSuccess('Training deleted successfully');
      navigate('/trainings');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete training';
      setUploadError(message);
    } finally {
      setUploading(false);
      setTrainingDeleteOpen(false);
    }
  };

  // Test result delete handler
  const handleDeleteTestResult = async (testResultId: string) => {
    try {
      setUploading(true);
      await testResultService.deleteTestResult(testResultId);
      setUploadSuccess('Test result deleted successfully');
      refetch(); // This will trigger the useEffect in useTrainingDetail to reload test results
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete test result';
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  };

  // LaTeX export handler
  const handleLatexExport = (testResult: TestResult) => {
    const latex = generateLatexCode(testResult);
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  // Aggregated LaTeX export handler
  const handleAggregatedLatexExport = (aggregatedStats: any, hasCyclistPedestrianData: boolean, testResultsCount: number) => {
    const latex = generateAggregatedLatexCode(aggregatedStats, hasCyclistPedestrianData, testResultsCount);
    setLatexCode(latex);
    setLatexModalOpen(true);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !training) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Failed to load training details'}
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Header */}
      <Box mb={4}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => {
            if (training?.projectId) {
              navigate(`/projects/${training.projectId}?tab=trainings`);
            } else {
              navigate('/trainings');
            }
          }}
          sx={{ mb: 2, color: 'text.secondary', '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
        >
          Back to Trainings
        </Button>

        <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'flex-start' }} gap={3}>
          <Box>
            <Box display="flex" alignItems="center" gap={2} mb={1} flexWrap="wrap">
              <Typography variant="h4" component="h1" fontWeight="bold">
                {training.name}
              </Typography>
              <StatusChip status={training.status} />
            </Box>
            <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 800, mb: 2 }}>
              {training.description || 'No description provided'}
            </Typography>
            
            {training.tags && training.tags.length > 0 && (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {training.tags.map((tag) => (
                  <Chip 
                    key={tag} 
                    label={tag} 
                    size="small" 
                    variant="outlined"
                    sx={{ borderRadius: 1 }}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Stack direction="row" spacing={1}>
            <Button 
              startIcon={<RefreshIcon />} 
              onClick={() => refetch()} 
              variant="outlined" 
              color="inherit"
              disabled={isLoading}
            >
              Refresh
            </Button>
            {isAuthenticated && (
              <>
                <Button 
                  startIcon={<EditIcon />} 
                  onClick={handleEditTraining} 
                  variant="outlined"
                  disabled={isLoading}
                >
                  Edit
                </Button>
                <Button 
                  startIcon={<DeleteIcon />} 
                  onClick={() => setTrainingDeleteOpen(true)} 
                  color="error" 
                  variant="outlined" 
                  disabled={isLoading}
                >
                  Delete
                </Button>
              </>
            )}
          </Stack>
        </Box>
      </Box>

      {/* Tab Navigation */}
      <Paper 
        elevation={0} 
        variant="outlined" 
        sx={{ 
          mb: 3, 
          borderRadius: 2, 
          overflow: 'hidden',
          bgcolor: 'background.paper'
        }}
      >
        <Tabs 
          value={detailTab} 
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ 
            borderBottom: 1, 
            borderColor: 'divider',
            '& .MuiTab-root': { 
              textTransform: 'none',
              fontWeight: 600,
              minHeight: 48,
              px: { xs: 2, sm: 3 },
              minWidth: { xs: 'auto', sm: 90 },
              flexShrink: 0
            },
            '& .MuiTabs-scrollButtons': {
              display: { xs: 'flex', sm: 'auto' }
            },
            '& .MuiTabs-scroller': {
              overflow: 'auto !important',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none'
              }
            }
          }}
        >
          <Tab label="Overview" />
          <Tab label="Epochs" />
          <Tab label="Test Results" />
          <Tab label="Visualizations" />
          <Tab label="System Info" />
          <Tab label="Config" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Paper>

      {/* Overview Tab */}
      {detailTab === 0 && (
        <TrainingOverviewTab
          training={training}
          epochs={epochs}
          trainingId={id!}
          comments={comments}
          commentsLoading={commentsLoading}
          onCommentsRefetch={refetchComments}
        />
      )}

      {/* Epochs Tab */}
      {detailTab === 1 && (
        <TrainingEpochsTab
          epochs={epochs}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          deleteOpen={deleteOpen}
          deleteTarget={deleteTarget}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          onFileUpload={(files) => handleFileUpload(files, 'epoch')}
          onDeleteClick={handleDeleteClick}
          onConfirmDelete={handleConfirmDelete}
          onSetDeleteOpen={setDeleteOpen}
          onSetUploadResultsOpen={setUploadResultsOpen}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Test Results Tab */}
      {detailTab === 2 && (
        <TrainingTestResultsTab
          allTestResults={allTestResults}
          testResultsLoading={testResultsLoading}
          availableTestEpochs={availableTestEpochs}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          latexModalOpen={latexModalOpen}
          latexCode={latexCode}
          onTestResultFileUpload={(files) => handleFileUpload(files, 'testResult')}
          onLatexExport={handleLatexExport}
          onAggregatedLatexExport={handleAggregatedLatexExport}
          onSetUploadResultsOpen={setUploadResultsOpen}
          onSetLatexModalOpen={setLatexModalOpen}
          onDeleteTestResult={handleDeleteTestResult}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Visualizations Tab */}
      {detailTab === 3 && (
        <TrainingVisualizationsTab
          training_uuid={training.uuid}
          epochs={epochs}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* System Info Tab */}
      {detailTab === 4 && (
        <TrainingSystemInfoTab
          epochs={epochs}
        />
      )}

      {/* Config Tab */}
      {detailTab === 5 && (
        <TrainingConfigTab
          config={config}
          configLoading={configLoading}
          training={training}
        />
      )}

      {/* Benchmarks Tab */}
      {detailTab === 6 && (
        <TrainingBenchmarksTab
          training_uuid={training.uuid}
          isAuthenticated={isAuthenticated}
        />
      )}

      {/* Dialogs */}
      <DeleteConfirmationDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Epoch"
        message={`Are you sure you want to delete Epoch ${deleteTarget?.epoch}? This action cannot be undone.`}
        isDeleting={uploading}
      />

      <DeleteConfirmationDialog
        open={trainingDeleteOpen}
        onClose={() => setTrainingDeleteOpen(false)}
        onConfirm={handleConfirmDeleteTraining}
        title="Delete Training"
        message="Are you sure you want to delete this training? This action cannot be undone and will also delete all associated epochs and test results."
        isDeleting={uploading}
      />

      <UploadResultsDialog
        open={uploadResultsOpen}
        onClose={() => setUploadResultsOpen(false)}
        results={uploadResults}
      />

      <LatexExportDialog
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        latexCode={latexCode}
      />

      <TrainingFormDialog
        open={editDialogOpen}
        onClose={handleEditCancel}
        onSubmit={handleEditConfirm}
        isEditing={true}
        isCreating={isUpdating}
        isLoadingData={editLoadingConfigs || editLoadingDatasets || editLoadingProjects}
        trainingName={editName}
        onNameChange={setEditName}
        trainingDescription={editDescription}
        onDescriptionChange={setEditDescription}
        selectedConfigId={editConfigId}
        onConfigChange={setEditConfigId}
        selectedDatasetId={editDatasetId}
        onDatasetChange={setEditDatasetId}
        selectedProjectId={editProjectId}
        onProjectChange={setEditProjectId}
        selectedStatus={editStatus}
        onStatusChange={setEditStatus}
        trainingTags={editTags}
        onTagsChange={setEditTags}
        availableTags={availableTags}
        configs={editConfigs}
        datasets={editDatasets}
        projects={editProjects}
        error={updateError}
        success={updateSuccess}
        loadingConfigs={editLoadingConfigs}
        loadingDatasets={editLoadingDatasets}
        loadingProjects={editLoadingProjects}
      />
    </Container>
  );
};

export default TrainingDetailPage;
