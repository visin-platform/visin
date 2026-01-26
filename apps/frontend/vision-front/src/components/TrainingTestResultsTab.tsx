import React from 'react';
import {
  Box,
  Alert,
  Button
} from '@mui/material';
import { TestResult } from '../types';
import UploadResultsDialog from './training/UploadResultsDialog';
import LatexExportDialog from './training/LatexExportDialog';
import TestResultsHeader from './training/TestResultsHeader';
import TestResultsList from './training/TestResultsList';

interface TrainingTestResultsTabProps {
  allTestResults: TestResult[];
  testResultsLoading: boolean;
  availableTestEpochs: number[];
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
  onTestResultFileUpload: (files: FileList) => Promise<void>;
  onLatexExport: (testResult: TestResult) => void;
  onSetUploadResultsOpen: (open: boolean) => void;
  onSetLatexModalOpen: (open: boolean) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TrainingTestResultsTab: React.FC<TrainingTestResultsTabProps> = ({
  allTestResults,
  testResultsLoading,
  availableTestEpochs,
  uploading,
  uploadError,
  uploadSuccess,
  uploadResultsOpen,
  uploadResults,
  latexModalOpen,
  latexCode,
  onTestResultFileUpload,
  onLatexExport,
  onSetUploadResultsOpen,
  onSetLatexModalOpen,
  onDeleteTestResult,
  isAuthenticated
}) => {

  return (
    <Box>
      <TestResultsHeader
        uploading={uploading}
        onTestResultFileUpload={onTestResultFileUpload}
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

      <TestResultsList
        allTestResults={allTestResults}
        testResultsLoading={testResultsLoading}
        availableTestEpochs={availableTestEpochs}
        hasCyclistPedestrianData={false}
        uploading={uploading}
        onLatexExport={onLatexExport}
        onDeleteTestResult={onDeleteTestResult}
        isAuthenticated={isAuthenticated}
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

export default TrainingTestResultsTab;