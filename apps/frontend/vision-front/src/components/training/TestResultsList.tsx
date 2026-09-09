import React, { useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  CircularProgress,
  Paper
} from '@mui/material';
import { TestResult } from '../../types';
import TestResultTable from './TestResultTable';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

interface TestResultsListProps {
  allTestResults: TestResult[];
  testResultsLoading: boolean;
  availableTestEpochs: number[];
  uploading: boolean;
  onLatexExport: (testResult: TestResult) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TestResultsList: React.FC<TestResultsListProps> = ({
  allTestResults,
  testResultsLoading,
  availableTestEpochs,
  uploading,
  onLatexExport,
  onDeleteTestResult,
  isAuthenticated
}) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);

  const handleDeleteClick = (testResult: TestResult) => {
    setDeleteTarget(testResult);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteTarget && onDeleteTestResult) {
      onDeleteTestResult(deleteTarget._id);
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
    }
  };

  if (testResultsLoading) {
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

  if (allTestResults.length === 0) {
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
          No test results found
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 3
          }}>
          Upload test result JSON files to see performance metrics.
        </Typography>
      </Paper>
    );
  }

  return (
    <>
      <Stack spacing={4}>
        {/* Group test results by epoch */}
        {availableTestEpochs.sort((a, b) => a - b).map((epoch) => {
          // Filter test results for this epoch
          const epochTestResults = allTestResults.filter(tr => tr.epoch === epoch);

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
                {epochTestResults.map((testResult) => (
                  <TestResultTable
                    key={testResult._id}
                    testResult={testResult}
                    onLatexExport={onLatexExport}
                    onDeleteTestResult={() => handleDeleteClick(testResult)}
                    isAuthenticated={isAuthenticated}
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
        title="Delete Test Result"
        message={`Are you sure you want to delete this test result? ${deleteTarget ? `(UUID: ${deleteTarget.test_uuid})` : ''} This action cannot be undone.`}
        isDeleting={uploading}
      />
    </>
  );
};

export default TestResultsList;