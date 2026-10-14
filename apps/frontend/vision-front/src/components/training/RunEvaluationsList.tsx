import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Paper
} from '@mui/material';
import { RunEvaluation } from '../../types';
import type { Training } from '../../types/training';
import { describeEmpty } from '../../utils/trainingStatus';
import RunEvaluationCard from './RunEvaluationCard';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

interface RunEvaluationsListProps {
  allEvaluations: RunEvaluation[];
  evaluationsLoading: boolean;
  availableEpochs: number[];
  uploading: boolean;
  onLatexExport: (evaluation: RunEvaluation) => void;
  onDeleteEvaluation?: (evaluationId: string) => void;
  isAuthenticated: boolean;
  /** the run these belong to, so an empty list can say why */
  run?: Pick<Training, 'status' | 'lastSeenAt'>;
}

const RunEvaluationsList: React.FC<RunEvaluationsListProps> = ({
  allEvaluations,
  evaluationsLoading,
  availableEpochs,
  uploading,
  onLatexExport,
  onDeleteEvaluation,
  isAuthenticated,
  run
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RunEvaluation | null>(null);

  // `?evaluation=<id>`, from the project's list: the one that was clicked is brought into view and outlined.
  const focused = new URLSearchParams(window.location.search).get('evaluation') ?? undefined;
  useEffect(() => {
    if (!focused || evaluationsLoading) return;
    document.getElementById(`evaluation-${focused}`)?.scrollIntoView?.({ block: 'center' });
  }, [focused, evaluationsLoading, allEvaluations.length]);

  const handleDeleteClick = (evaluation: RunEvaluation) => {
    setDeleteTarget(evaluation);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget && onDeleteEvaluation) {
      onDeleteEvaluation(deleteTarget._id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  if (evaluationsLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          py: 8
        }}>
        <CircularProgress />
      </Box>
    );
  }

  if (allEvaluations.length === 0) {
    const empty = describeEmpty('tests', run);
    return (
      <Paper
        elevation={0}
        variant="outlined"
        sx={{
          p: 6,
          textAlign: 'center',
          borderRadius: 2,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="h6" gutterBottom sx={{
          color: "text.secondary"
        }}>
          {empty.title}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 3
          }}>
          {empty.body}{isAuthenticated && ' You can also upload result JSON files here.'}
        </Typography>
      </Paper>
    );
  }

  return (
    <>
      <Stack spacing={4}>
        {/* Group evaluations by epoch */}
        {/* A copy: sorting the prop in place would reorder the caller's memoised array. */}
        {[...availableEpochs].sort((a, b) => a - b).map((epoch) => {
          // Filter evaluations for this epoch
          const epochEvaluations = allEvaluations.filter(tr => tr.epoch === epoch);

          return (
            <Box key={epoch}>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: "bold",
                  mb: 2
                }}>
                Epoch {epoch}
              </Typography>
              <Stack spacing={3}>
                {epochEvaluations.map((evaluation) => (
                  <RunEvaluationCard
                    key={evaluation._id}
                    evaluation={evaluation}
                    onLatexExport={onLatexExport}
                    onDeleteEvaluation={() => handleDeleteClick(evaluation)}
                    isAuthenticated={isAuthenticated}
                    highlighted={evaluation._id === focused}
                  />
                ))}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Evaluation"
        message={`Are you sure you want to delete this evaluation? ${deleteTarget ? `(UUID: ${deleteTarget.test_uuid})` : ''} This action cannot be undone.`}
        isDeleting={uploading}
      />
    </>
  );
};

export default RunEvaluationsList;