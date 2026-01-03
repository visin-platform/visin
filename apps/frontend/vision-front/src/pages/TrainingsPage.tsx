import React from 'react';
import {
  Container,
  Alert
} from '@mui/material';
import TrainingsTable from '../components/TrainingsTable';
import TrainingFilters from '../components/TrainingFilters';
import TrainingFormDialog from '../components/TrainingFormDialog';
import { usePageTitle } from '../hooks/usePageTitle';
import { useTrainingsPage } from '../hooks/useTrainingsPage';
import BulkActionsBar from '../components/trainings/BulkActionsBar';
import DeleteTrainingDialog from '../components/trainings/DeleteTrainingDialog';
import DeleteMultipleTrainingsDialog from '../components/trainings/DeleteMultipleTrainingsDialog';

const TrainingsPage: React.FC = () => {
  // Set page title
  usePageTitle('Trainings - Vision');

  const {
    isAuthenticated,
    page,
    rowsPerPage,
    searchTerm,
    setSearchTerm,
    sortBy,
    sortOrder,
    createModalOpen,
    trainingName,
    setTrainingName,
    trainingDescription,
    setTrainingDescription,
    selectedDatasetId,
    setSelectedDatasetId,
    selectedConfigId,
    setSelectedConfigId,
    selectedProjectId,
    setSelectedProjectId,
    selectedStatus,
    setSelectedStatus,
    trainingTags,
    setTrainingTags,
    datasets,
    configs,
    projects,
    loadingDatasets,
    loadingConfigs,
    loadingProjects,
    creating,
    createError,
    createSuccess,
    editingTrainingId,
    deleteDialogOpen,
    setDeleteDialogOpen,
    selectedTrainingIds,
    deleteMultipleDialogOpen,
    setDeleteMultipleDialogOpen,
    selectedTags,
    setSelectedTags,
    availableTags,
    excludedTags,
    setExcludedTags,
    isLoading,
    error,
    displayTrainings,
    totalCount,
    exportToCSV,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSort,
    handleCreateTraining,
    handleCloseModal,
    handleEditTraining,
    handleDeleteClick,
    handleConfirmDelete,
    handleSelectTraining,
    handleSelectAll,
    handleCompareSelected,
    handleDeleteSelected
  } = useTrainingsPage();

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <TrainingFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        excludedTags={excludedTags}
        onExcludedTagsChange={setExcludedTags}
        availableTags={availableTags}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
          {error instanceof Error ? error.message : 'Failed to load training runs'}
        </Alert>
      )}

      <BulkActionsBar
        selectedCount={selectedTrainingIds.size}
        onExport={exportToCSV}
        onCompare={handleCompareSelected}
        onDelete={() => setDeleteMultipleDialogOpen(true)}
        isAuthenticated={isAuthenticated}
      />

      <TrainingsTable
        trainings={displayTrainings}
        isLoading={isLoading}
        page={page}
        rowsPerPage={rowsPerPage}
        total={totalCount}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        onEdit={handleEditTraining}
        onDelete={handleDeleteClick}
        searchTerm={searchTerm}
        selectedTrainingIds={selectedTrainingIds}
        onSelectTraining={handleSelectTraining}
        onSelectAll={handleSelectAll}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        isAuthenticated={isAuthenticated}
      />

      {/* Create/Edit Training Modal */}
      <TrainingFormDialog
        open={createModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleCreateTraining}
        isEditing={!!editingTrainingId}
        isCreating={creating}
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
        availableTags={availableTags}
        configs={configs}
        datasets={datasets}
        projects={projects}
        error={createError}
        success={createSuccess}
        loadingConfigs={loadingConfigs}
        loadingDatasets={loadingDatasets}
        loadingProjects={loadingProjects}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteTrainingDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        isDeleting={creating}
      />

      {/* Delete Multiple Confirmation Dialog */}
      <DeleteMultipleTrainingsDialog
        open={deleteMultipleDialogOpen}
        onClose={() => setDeleteMultipleDialogOpen(false)}
        onConfirm={handleDeleteSelected}
        count={selectedTrainingIds.size}
        isDeleting={creating}
      />
    </Container>
  );
};

export default TrainingsPage;
