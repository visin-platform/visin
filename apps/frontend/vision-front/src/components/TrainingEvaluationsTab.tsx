import React from 'react';
import {
  Box,
  Alert,
  Button
} from '@mui/material';
import { RunEvaluation } from '../types';
import UploadResultsDialog from './training/UploadResultsDialog';
import LatexExportDialog from './training/LatexExportDialog';
import RunEvaluationsHeader from './training/RunEvaluationsHeader';
import RunEvaluationsList from './training/RunEvaluationsList';
import type { Training } from '../types/training';

interface TrainingEvaluationsTabProps {
  allEvaluations: RunEvaluation[];
  evaluationsLoading: boolean;
  availableEpochs: number[];
  uploading: boolean;
  uploadError: string | null;
  uploadSuccess: string | null;
  uploadResultsOpen: boolean;
  uploadResults: {
    successful: Array<{ name: string; operation: string }>;
    failed: Array<{ name: string; error: string }>;
  };
  latexModalOpen: boolean;
  latexCode: string;
  onEvaluationFileUpload: (files: FileList) => Promise<void>;
  onLatexExport: (evaluation: RunEvaluation) => void;
  onSetUploadResultsOpen: (open: boolean) => void;
  onSetLatexModalOpen: (open: boolean) => void;
  onDeleteEvaluation?: (evaluationId: string) => void;
  isAuthenticated: boolean;
  /** the run these belong to, so an empty tab can say why */
  run?: Pick<Training, 'status' | 'lastSeenAt'>;
}

const TrainingEvaluationsTab: React.FC<TrainingEvaluationsTabProps> = ({
  allEvaluations,
  evaluationsLoading,
  availableEpochs,
  uploading,
  uploadError,
  uploadSuccess,
  uploadResultsOpen,
  uploadResults,
  latexModalOpen,
  latexCode,
  onEvaluationFileUpload,
  onLatexExport,
  onSetUploadResultsOpen,
  onSetLatexModalOpen,
  onDeleteEvaluation,
  isAuthenticated,
  run
}) => {

  return (
    <Box>
      <RunEvaluationsHeader
        uploading={uploading}
        onEvaluationFileUpload={onEvaluationFileUpload}
        isAuthenticated={isAuthenticated}
      />

      {/* Status Alerts */}
      {uploadError && (
        <Alert
          severity="error"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadError}
        </Alert>
      )}
      {uploadSuccess && (
        <Alert
          severity="success"
          sx={{ mb: 3, borderRadius: 2 }}
          action={
            <Button color="inherit" size="small" onClick={() => onSetUploadResultsOpen(true)}>
              View Details
            </Button>
          }
        >
          {uploadSuccess}
        </Alert>
      )}

      <RunEvaluationsList
        allEvaluations={allEvaluations}
        evaluationsLoading={evaluationsLoading}
        availableEpochs={availableEpochs}
        uploading={uploading}
        onLatexExport={onLatexExport}
        onDeleteEvaluation={onDeleteEvaluation}
        isAuthenticated={isAuthenticated}
        run={run}
      />

      {/* Upload Results Modal */}
      <UploadResultsDialog
        open={uploadResultsOpen}
        onClose={() => onSetUploadResultsOpen(false)}
        results={uploadResults}
      />

      {/* LaTeX Export Dialog */}
      <LatexExportDialog
        open={latexModalOpen}
        onClose={() => onSetLatexModalOpen(false)}
        latexCode={latexCode}
      />
    </Box>
  );
};

export default TrainingEvaluationsTab;