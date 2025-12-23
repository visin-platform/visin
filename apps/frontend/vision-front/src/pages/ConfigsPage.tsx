import React from 'react';
import {
  Box,
  Container,
  Typography,
  IconButton,
  Alert
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { usePageTitle } from '../hooks/usePageTitle';
import { useConfigsPage } from '../hooks/useConfigsPage';
import ConfigsTable from '../components/configs/ConfigsTable';
import ConfigDetailsDialog from '../components/configs/ConfigDetailsDialog';
import EditConfigDialog from '../components/configs/EditConfigDialog';
import DeleteConfigDialog from '../components/configs/DeleteConfigDialog';
import DeleteMultipleConfigsDialog from '../components/configs/DeleteMultipleConfigsDialog';
import ConfigUploadButton from '../components/configs/ConfigUploadButton';

const ConfigsPage: React.FC = () => {
  // Set page title
  usePageTitle('Configurations - Vision');

  const {
    configs,
    loading,
    error,
    setError,
    success,
    setSuccess,
    uploading,
    selectedConfigIds,
    deleteMultipleDialogOpen,
    setDeleteMultipleDialogOpen,
    detailsDialogOpen,
    setDetailsDialogOpen,
    selectedConfig,
    deleteDialogOpen,
    setDeleteDialogOpen,
    editDialogOpen,
    setEditDialogOpen,
    editingConfig,
    editConfigName,
    setEditConfigName,
    fileInputRef,
    handleFileChange,
    handleViewDetails,
    handleEditClick,
    handleEditSave,
    handleDeleteClick,
    handleConfirmDelete,
    handleSelectConfig,
    handleSelectAll,
    handleDeleteSelected,
    handleRefresh
  } = useConfigsPage();

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Typography variant="h4" component="h1">
          Configs Library
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ConfigUploadButton
            uploading={uploading}
            fileInputRef={fileInputRef}
            onFileChange={handleFileChange}
          />
          <IconButton onClick={handleRefresh} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Manage training configurations. Configs are independent and can be selected when creating trainings.
      </Typography>

      {/* Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ConfigsTable
        configs={configs}
        loading={loading}
        selectedConfigIds={selectedConfigIds}
        onSelectAll={handleSelectAll}
        onSelectConfig={handleSelectConfig}
        onViewDetails={handleViewDetails}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onDeleteMultiple={() => setDeleteMultipleDialogOpen(true)}
      />

      {/* Details Dialog */}
      <ConfigDetailsDialog
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
        config={selectedConfig}
      />

      {/* Edit Config Name Dialog */}
      <EditConfigDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEditSave}
        config={editingConfig}
        configName={editConfigName}
        onConfigNameChange={setEditConfigName}
        loading={loading}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfigDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        loading={loading}
      />

      {/* Delete Multiple Confirmation Dialog */}
      <DeleteMultipleConfigsDialog
        open={deleteMultipleDialogOpen}
        onClose={() => setDeleteMultipleDialogOpen(false)}
        onConfirm={handleDeleteSelected}
        count={selectedConfigIds.size}
        loading={loading}
      />
    </Container>
  );
};

export default ConfigsPage;
