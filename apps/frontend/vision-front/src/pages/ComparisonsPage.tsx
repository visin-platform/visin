import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Container
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { useComparisonsPage } from '../hooks/useComparisonsPage';
import ComparisonsTable from '../components/comparisons/ComparisonsTable';
import DeleteComparisonDialog from '../components/comparisons/DeleteComparisonDialog';
import EditComparisonDialog from '../components/comparisons/EditComparisonDialog';

const ComparisonsPage: React.FC = () => {
  const {
    comparisons,
    loading,
    error,
    deleteDialogOpen,
    editDialogOpen,
    comparisonToEdit,
    editName,
    setEditName,
    editDescription,
    setEditDescription,
    editSelectedIds,
    updating,
    trainingData,
    loadingTrainings,
    sortBy,
    sortOrder,
    theme,
    handleSort,
    loadComparisons,
    handleDeleteComparison,
    handleConfirmDelete,
    handleCancelDelete,
    canDeleteComparisons,
    handleEditComparison,
    handleCancelEdit,
    handleUpdateComparison,
    handleEditTrainingIdToggle,
    handleViewComparison,
    formatTimestamp,
    getTypeColor
  } = useComparisonsPage();

  if (loading && comparisons.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Comparisons
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Compare and analyze model performance across different test results
          </Typography>
        </Box>
        <Box>
          <Tooltip title="Refresh">
            <IconButton
              onClick={() => {
                loadComparisons();
              }}
              sx={{ 
                bgcolor: 'background.paper',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                '&:hover': { bgcolor: theme.palette.action.hover }
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <ComparisonsTable
        comparisons={comparisons}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
        onViewComparison={handleViewComparison}
        onEditComparison={handleEditComparison}
        onDeleteComparison={handleDeleteComparison}
        canDelete={canDeleteComparisons()}
        formatTimestamp={formatTimestamp}
        getTypeColor={getTypeColor}
        theme={theme}
      />

      {comparisons.length === 0 && !loading && (
        <Box textAlign="center" py={6}>
          <Typography variant="h6" color="textSecondary">
            No comparisons found
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Create comparisons from training, test, or benchmark views to see them here
          </Typography>
        </Box>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteComparisonDialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* Edit Comparison Modal */}
      <EditComparisonDialog
        open={editDialogOpen}
        onClose={handleCancelEdit}
        onUpdate={handleUpdateComparison}
        comparison={comparisonToEdit}
        name={editName}
        onNameChange={setEditName}
        description={editDescription}
        onDescriptionChange={setEditDescription}
        selectedIds={editSelectedIds}
        onToggleId={handleEditTrainingIdToggle}
        updating={updating}
        loadingTrainings={loadingTrainings}
        trainingData={trainingData}
      />
    </Container>
  );
};

export default ComparisonsPage;
