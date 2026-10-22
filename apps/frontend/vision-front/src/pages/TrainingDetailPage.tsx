import { useWriteCapabilities } from '../hooks/useWriteCapabilities';
import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Box, Container, CircularProgress, Alert } from '@mui/material';

import TrainingOverviewTab from '../components/TrainingOverviewTab';
import TrainingEpochsTab from '../components/TrainingEpochsTab';
import TrainingEvaluationsTab from '../components/TrainingEvaluationsTab';
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
import { TRAINING_TABS, type TrainingTab } from '../components/training/trainingTabs';
import TrainingModelsTab from '../components/training/TrainingModelsTab';
import SampleTour from '../components/guide/SampleTour';
import UseThisDialog from '../components/common/UseThisDialog';
import { runSnippets } from '../utils/useSnippets';

import { useTrackVisit } from '@visin/frontend-core';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTrainingDetail } from '../hooks/useTrainingDetail';
import { useTrainingEdit } from '../hooks/useTrainingEdit';
import { useTrainingActions } from '../hooks/useTrainingActions';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { TaxonomyProvider } from '../taxonomy/TaxonomyProvider';
import { CostingProvider } from '../costing/CostingProvider';
import { projectService } from '../services/projectService';
import { trainingService } from '../services/trainingService';
import { isStoredModel } from '../utils/modelLinks';

const TrainingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = useWriteCapabilities('training', id ? [id] : []);

  // Custom hooks
  const {
    training,
    epochs,
    isLoading,
    error,
    refetch,
    config,
    configLoading,
    allEvaluations,
    evaluationsLoading,
    availableEpochs
  } = useTrainingDetail(id);

  // Fetch project information if training has a projectId
  const { data: projectResponse } = useQuery({
    queryKey: ['project', training?.projectId],
    queryFn: () => projectService.getProjectById(training!.projectId!),
    enabled: !!training?.projectId
  });

  const project = projectResponse?.data;
  const [returnToProject, setReturnToProject] = useState(false);
  const [useOpen, setUseOpen] = useState(false);

  const {
    editDialogOpen,
    handleEditTraining,
    handleEditConfirm,
    handleEditCancel,
    editName, setEditName,
    editDescription, setEditDescription,
    editProjectId, setEditProjectId,
    editStatus, setEditStatus,
    editTags, setEditTags,
    availableTags,
    editProjects,
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
    handleDeleteEvaluation,
    handleLatexExport
  } = useTrainingActions({
    trainingId: training?._id,
    refetch,
    // A sample deleted from its tour goes back to the project, where the
    // first-run panel is waiting on its next step.
    onTrainingDeleted: () =>
      navigate(returnToProject && project ? `/projects/${project.slug || project._id}` : '/trainings')
  });

  // Set page title
  usePageTitle(training ? `${training.name} - Vision` : 'Training Details - Vision');
  useTrackVisit(training ? { kind: 'training', id: training._id, name: training.name, path: `/trainings/${training._id}` } : null);

  // The tab is the URL's, so a link to `?tab=models&model=…` from elsewhere on the page switches to it.
  const hasStoredModels = Boolean(training?.models?.some(isStoredModel));
  const requestedTab = TRAINING_TABS.find(([name]) => name === searchParams.get('tab'))?.[0];
  const detailTab: TrainingTab = requestedTab && (requestedTab !== 'models' || hasStoredModels) ? requestedTab : 'overview';
  const showTab = (tab: TrainingTab, model?: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (model) next.set('model', model);
    else next.delete('model');
    setSearchParams(next, { replace: true });
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
        isAuthenticated={canWrite(id)}
        isLoading={isLoading}
        onRefresh={() => refetch()}
        onUse={() => setUseOpen(true)}
        onEdit={handleEditTraining}
        onDeleteClick={() => setTrainingDeleteOpen(true)}
      />
      {useOpen && <UseThisDialog title="Use this run" snippets={runSnippets(training)} onClose={() => setUseOpen(false)} />}
      <TrainingDetailTabs value={detailTab} onChange={(_event, tab) => showTab(tab)} showModels={hasStoredModels} />
      <SampleTour
        onDeleteSample={() => {
          setReturnToProject(true);
          setTrainingDeleteOpen(true);
        }}
      />
      {/* Overview Tab */}
      {detailTab === 'overview' && (
        <TrainingOverviewTab
          training={training}
          epochs={epochs}
          canEdit={canWrite(training._id)}
          onSaveNotes={async (notes) => {
            await trainingService.updateTraining(training._id, { notes });
            await refetch();
          }}
        />
      )}
      {/* Epochs Tab */}
      {detailTab === 'epochs' && (
        <TrainingEpochsTab
          epochs={epochs}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          deleteOpen={deleteOpen}
          deleteTarget={deleteTarget}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          run={training}
          onFileUpload={(files) => handleFileUpload(files, 'epoch')}
          onDeleteClick={handleDeleteClick}
          onConfirmDelete={handleConfirmDelete}
          onSetDeleteOpen={setDeleteOpen}
          onSetUploadResultsOpen={setUploadResultsOpen}
          isAuthenticated={canWrite(id)}
        />
      )}
      {/* Test Results Tab */}
      {detailTab === 'evaluations' && (
        <TrainingEvaluationsTab
          allEvaluations={allEvaluations}
          evaluationsLoading={evaluationsLoading}
          availableEpochs={availableEpochs}
          uploading={uploading}
          uploadError={uploadError}
          uploadSuccess={uploadSuccess}
          uploadResultsOpen={uploadResultsOpen}
          uploadResults={uploadResults}
          latexModalOpen={latexModalOpen}
          latexCode={latexCode}
          onEvaluationFileUpload={(files) => handleFileUpload(files, 'evaluation')}
          onLatexExport={handleLatexExport}
          onSetUploadResultsOpen={setUploadResultsOpen}
          onSetLatexModalOpen={setLatexModalOpen}
          onDeleteEvaluation={handleDeleteEvaluation}
          isAuthenticated={canWrite(id)}
          run={training}
        />
      )}
      {/* Visualizations Tab */}
      {detailTab === 'visualizations' && (
        <TrainingVisualizationsTab
          training_uuid={training.uuid}
          epochs={epochs}
          isAuthenticated={canWrite(id)}
          run={training}
          models={training.models}
        />
      )}
      {/* The models the run keeps here, and what they produced */}
      {detailTab === 'models' && training.models && (
        <TrainingModelsTab
          trainingId={training._id}
          models={training.models}
          selectedModelId={searchParams.get('model')}
          onSelectModel={(model) => showTab('models', model)}
          onShowTab={(tab) => showTab(tab)}
        />
      )}
      {/* System Info Tab */}
      {detailTab === 'system-info' && (
        <TrainingSystemInfoTab
          epochs={epochs}
        />
      )}
      {/* Config Tab */}
      {detailTab === 'config' && (
        <TrainingConfigTab
          config={config}
          configLoading={configLoading}
          training={training}
        />
      )}
      {/* Benchmarks Tab */}
      {detailTab === 'benchmarks' && (
        <TrainingBenchmarksTab
          training_uuid={training.uuid}
          isAuthenticated={canWrite(id)}
          run={training}
        />
      )}
      {/* Conclusions about this run, and comparative ones that cite it. Needs
          the project, since findings hang off one and access follows it. */}
      {detailTab === 'analysis' && project && (
        <FindingsPanel
          projectId={project._id}
          trainingId={training._id}
          isOwner={canWrite(id)}
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
        message="Delete this training, with its epochs and test results? It moves to Deleted trainings on the Trainings page, where you can restore it."
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
        isLoadingData={editLoadingProjects}
        trainingName={editName}
        onNameChange={setEditName}
        trainingDescription={editDescription}
        onDescriptionChange={setEditDescription}
        dataset={training?.dataset}
        datasetId={training?.datasetId}
        selectedProjectId={editProjectId}
        onProjectChange={setEditProjectId}
        selectedStatus={editStatus}
        onStatusChange={setEditStatus}
        trainingTags={editTags}
        onTagsChange={setEditTags}
        availableTags={availableTags}
        projects={editProjects}
        error={updateError}
        success={updateSuccess}
        loadingProjects={editLoadingProjects}
      />
    </Container>
    </CostingProvider>
    </TaxonomyProvider>
  );
};

export default TrainingDetailPage;
