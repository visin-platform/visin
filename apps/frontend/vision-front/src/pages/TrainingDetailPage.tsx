import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Container, CircularProgress, Alert } from '@mui/material';

import TrainingOverviewTab from '../components/TrainingOverviewTab';
import TrainingEpochsTab from '../components/TrainingEpochsTab';
import TrainingTestResultsTab from '../components/TrainingTestResultsTab';
import TrainingConfigTab from '../components/TrainingConfigTab';
import TrainingVisualizationsTab from '../components/TrainingVisualizationsTab';
import TrainingSystemInfoTab from '../components/TrainingSystemInfoTab';
import TrainingBenchmarksTab from '../components/TrainingBenchmarksTab';
import FindingsPanel from '../components/analysis/FindingsPanel';
import TrainingFormDialog from '../components/TrainingFormDialog';
import UploadResultsDialog from '../components/training/UploadResultsDialog';
import LatexExportDialog from '../components/training/LatexExportDialog';
import DeleteConfirmationDialog from '../components/training/DeleteConfirmationDialog';
import TrainingDetailHeader from '../components/training/TrainingDetailHeader';
import TrainingDetailTabs from '../components/training/TrainingDetailTabs';

import { usePageTitle } from '../hooks/usePageTitle';
import { useAuth } from '../contexts/AuthContext';
import { useTrainingDetail } from '../hooks/useTrainingDetail';
import { useTrainingEdit } from '../hooks/useTrainingEdit';
import { useTrainingActions } from '../hooks/useTrainingActions';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { CostingProvider } from '../costing/CostingProvider';
import { projectService } from '../services/projectService';

const TrainingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAuthenticated, user } = useAuth();

  // Tab mapping
  const tabNames = ['overview', 'epochs', 'test-results', 'visualizations', 'system-info', 'config', 'benchmarks', 'analysis'];
  const getTabIndex = (tabName: string) => tabNames.indexOf(tabName);
  const getTabName = (index: number) => tabNames[index] || 'overview';

  // Initialize tab from URL or default to 0
  const initialTab = getTabIndex(searchParams.get('tab') || 'overview');
  const [detailTab, setDetailTab] = useState(initialTab >= 0 ? initialTab : 0);

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
    availableTestEpochs
  } = useTrainingDetail(id);

  // Fetch project information if training has a projectId
  const { data: projectResponse } = useQuery({
    queryKey: ['project', training?.projectId],
    queryFn: () => projectService.getProjectById(training!.projectId!),
    enabled: !!training?.projectId
  });

  const project = projectResponse?.data;

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

  const {
    uploading,
    uploadError,
    uploadSuccess,
    deleteOpen,
    setDeleteOpen,
    deleteTarget,
    trainingDeleteOpen,
    setTrainingDeleteOpen,
    uploadResultsOpen,
    setUploadResultsOpen,
    uploadResults,
    latexModalOpen,
    setLatexModalOpen,
    latexCode,
    handleFileUpload,
    handleDeleteClick,
    handleConfirmDelete,
    handleConfirmDeleteTraining,
    handleDeleteTestResult,
    handleLatexExport
  } = useTrainingActions({
    trainingId: training?._id,
    refetch,
    onTrainingDeleted: () => navigate('/trainings')
  });

  // Set page title
  usePageTitle(training ? `${training.name} - Vision` : 'Training Details - Vision');

  // Handle tab change with URL update
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setDetailTab(newValue);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', getTabName(newValue));
    setSearchParams(newSearchParams, { replace: true });
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "80vh"
        }}>
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
    <TaxonomyProvider taxonomy={project?.taxonomy}>
    <CostingProvider costing={project?.costing}>
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          ...(project ? [
            { label: project.name, href: `/projects/${project.slug || project._id}` },
            { label: 'Trainings', href: `/projects/${project.slug || project._id}?tab=trainings` }
          ] : [
            { label: 'Trainings', href: '/trainings' }
          ]),
          { label: training.name, current: true }
        ]}
      />
      <TrainingDetailHeader
        training={training}
        isAuthenticated={isAuthenticated}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        onEdit={handleEditTraining}
        onDeleteClick={() => setTrainingDeleteOpen(true)}
      />
      <TrainingDetailTabs value={detailTab} onChange={handleTabChange} />
      {/* Overview Tab */}
      {detailTab === 0 && (
        <TrainingOverviewTab
          training={training}
          epochs={epochs}
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
      {/* Conclusions about this run, and comparative ones that cite it. Needs
          the project, since findings hang off one and access follows it. */}
      {detailTab === 7 && project && (
        <FindingsPanel
          projectId={project._id}
          trainingId={training._id}
          isOwner={user?.id === project.ownerId}
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
    </CostingProvider>
    </TaxonomyProvider>
  );
};

export default TrainingDetailPage;
