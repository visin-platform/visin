import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  Checkbox,
  TableBody,
  TablePagination
} from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { comparisonService } from '../../services/comparisonService';
import { formatDateTime } from '../../utils';

interface ProjectTestsTabProps {
  projectId: string;
  testResultsResponse: any;
  isLoading: boolean;
  page: number;
  rowsPerPage: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const ProjectTestsTab: React.FC<ProjectTestsTabProps> = ({
  projectId,
  testResultsResponse,
  isLoading,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange
}) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTestResultIds, setSelectedTestResultIds] = useState<Set<string>>(new Set());

  const handleSelectTestResult = (testResultId: string) => {
    const newSelected = new Set(selectedTestResultIds);
    if (newSelected.has(testResultId)) {
      newSelected.delete(testResultId);
    } else {
      newSelected.add(testResultId);
    }
    setSelectedTestResultIds(newSelected);
  };

  const handleSelectAllTestResults = () => {
    if (testResultsResponse?.data?.testResults && selectedTestResultIds.size === testResultsResponse.data.testResults.length) {
      setSelectedTestResultIds(new Set());
    } else {
      const allIds = new Set<string>(testResultsResponse?.data?.testResults.map((tr: any) => tr._id) || []);
      setSelectedTestResultIds(allIds);
    }
  };

  // Create comparison mutation
  const createComparisonMutation = useMutation({
    mutationFn: (data: { name: string; itemIds: string[]; projectId: string }) =>
      comparisonService.createComparison({
        name: data.name,
        type: 'trainings',
        itemIds: data.itemIds,
        projectId: data.projectId
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['project-comparisons', projectId] });
      navigate(`/comparisons/${response.data.uuid}?tab=tests`);
    }
  });

  const handleCompareSelectedTestResults = () => {
    const selectedIds = Array.from(selectedTestResultIds);
    if (selectedIds.length > 1) {
      // Get unique training IDs from selected test results
      const trainingIds = Array.from(new Set(
        testResultsResponse.data.testResults
          .filter((tr: any) => selectedTestResultIds.has(tr._id))
          .map((tr: any) => tr.training?._id)
          .filter((id: any) => id)
      )) as string[];
      
      if (trainingIds.length > 0) {
        // Create a comparison with the trainings
        const comparisonName = `Comparison of ${trainingIds.length} trainings (from test results)`;
        createComparisonMutation.mutate({
          name: comparisonName,
          itemIds: trainingIds,
          projectId: projectId
        });
      }
    }
  };

  return (
    <Box sx={{ px: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
        {selectedTestResultIds.size > 1 && (
          <Button
            variant="outlined"
            startIcon={<CompareIcon />}
            onClick={handleCompareSelectedTestResults}
            color="primary"
            size="small"
            sx={{ borderRadius: 2 }}
          >
            Compare Selected ({selectedTestResultIds.size})
          </Button>
        )}
      </Box>
      <Typography variant="h6" gutterBottom>Test Results</Typography>
      {isLoading ? (
        <CircularProgress />
      ) : testResultsResponse?.data?.testResults && testResultsResponse.data.testResults.length > 0 ? (
        <>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedTestResultIds.size > 0 && selectedTestResultIds.size < (testResultsResponse?.data?.testResults?.length || 0)}
                      checked={testResultsResponse?.data?.testResults && selectedTestResultIds.size === testResultsResponse.data.testResults.length}
                      onChange={handleSelectAllTestResults}
                    />
                  </TableCell>
                  <TableCell>Training</TableCell>
                  <TableCell>Epoch</TableCell>
                  <TableCell>Timestamp</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {testResultsResponse.data.testResults.map((testResult: any) => (
                  <TableRow key={testResult._id}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTestResultIds.has(testResult._id)}
                        onChange={() => handleSelectTestResult(testResult._id)}
                      />
                    </TableCell>
                    <TableCell>{testResult.training?.name || 'Unknown'}</TableCell>
                    <TableCell>{testResult.epoch}</TableCell>
                    <TableCell>{formatDateTime(testResult.timestamp)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <TablePagination
              component="div"
              count={testResultsResponse?.data?.pagination?.total || 0}
              page={page}
              onPageChange={onPageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={onRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Box>
        </>
      ) : (
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No test results found for this project.
        </Typography>
      )}
    </Box>
  );
};

export default ProjectTestsTab;
