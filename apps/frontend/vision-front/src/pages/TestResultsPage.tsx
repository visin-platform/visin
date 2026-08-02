import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Container,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Checkbox,
  useTheme,
  alpha
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Compare as CompareIcon
} from '@mui/icons-material';
import { testResultService } from '../services/testResultService';
import { TestResult, TestResultData, TestResultMetrics, TestResultOverallMetrics, TestResultCondition } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { isGroupAdmin } from '../utils/permissions';

export const TestResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);
  const [selectedTestResults, setSelectedTestResults] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: loading
  } = useQuery({
    queryKey: ['test-results'],
    queryFn: () => testResultService.getTestResults()
  });

  const testResults: TestResult[] = data?.data.testResults || [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => testResultService.deleteTestResult(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-results'] });
      setDeleteOpen(false);
      setDeleteTarget(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to delete test result');
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
  });

  const success = deleteMutation.isSuccess ? 'Test result deleted successfully' : null;

  // Check if user has permission to delete test results (owner or admin role)
  const canDeleteTestResults = () => isAuthenticated && isGroupAdmin(user);

  const handleDeleteClick = (testResult: TestResult) => {
    setDeleteTarget(testResult);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget._id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatNumber = (value: number, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  const getAverageMetric = (conditionData: TestResultData[string], metric: keyof TestResultMetrics): number => {
    const classNames: string[] = ['vehicle', 'sign', 'human'];
    const validClasses = classNames.filter(className => {
      const classData = (conditionData as TestResultCondition)[className];
      return classData && typeof classData === 'object' && (
        metric in classData ||
        (metric === 'f1_score' && ('f1' in classData || 'mean_f1' in classData))
      );
    });

    if (validClasses.length === 0) return 0;

    const sum = validClasses.reduce((acc, className) => {
      const classData = (conditionData as TestResultCondition)[className] as TestResultMetrics;
      // Handle different F1 field names: f1_score, f1, or mean_f1
      const value = metric === 'f1_score' ?
        (classData.f1_score || classData.f1 || classData.mean_f1) :
        classData[metric];
      return acc + (value || 0);
    }, 0);

    return sum / validClasses.length;
  };

  const getOverallMetrics = (testResults: TestResultData): { mIoU_foreground: number; mean_accuracy: number; fw_iou: number; pixel_accuracy: number } => {
    const conditions = ['day_fair', 'day_rain', 'night_fair', 'night_rain', 'snow'];
    const metrics = conditions.map(condition => {
      const conditionData = testResults[condition];
      return (conditionData && typeof conditionData === 'object' && 'overall' in conditionData) ? conditionData.overall : null;
    }).filter(Boolean) as TestResultOverallMetrics[];
    
    if (metrics.length === 0) {
      // Fallback to overall section if available
      const overall = testResults.overall;
      if (overall && typeof overall === 'object' && 'mIoU_foreground' in overall) {
        return {
          mIoU_foreground: overall.mIoU_foreground || 0,
          mean_accuracy: overall.mean_accuracy || 0,
          fw_iou: overall.fw_iou || 0,
          pixel_accuracy: overall.pixel_accuracy || 0
        };
      }
      return { mIoU_foreground: 0, mean_accuracy: 0, fw_iou: 0, pixel_accuracy: 0 };
    }

    return {
      mIoU_foreground: metrics.reduce((sum, m) => sum + m.mIoU_foreground, 0) / metrics.length,
      mean_accuracy: metrics.reduce((sum, m) => sum + m.mean_accuracy, 0) / metrics.length,
      fw_iou: metrics.reduce((sum, m) => sum + m.fw_iou, 0) / metrics.length,
      pixel_accuracy: metrics.reduce((sum, m) => sum + m.pixel_accuracy, 0) / metrics.length
    };
  };

  const handleSelectTestResult = (testResultId: string, checked: boolean) => {
    const newSelected = new Set(selectedTestResults);
    if (checked) {
      newSelected.add(testResultId);
    } else {
      newSelected.delete(testResultId);
    }
    setSelectedTestResults(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTestResults(new Set(testResults.map(tr => tr._id)));
    } else {
      setSelectedTestResults(new Set());
    }
  };

  const handleCompare = () => {
    if (selectedTestResults.size < 2) {
      setError('Please select at least 2 test results to compare');
      return;
    }
    if (selectedTestResults.size > 10) {
      setError('Maximum 10 test results can be compared at once');
      return;
    }
    // Get unique training IDs from selected test results
    const trainingIds = Array.from(new Set(
      testResults
        .filter(tr => selectedTestResults.has(tr._id))
        .map(tr => tr.training?._id)
        .filter(id => id)
    ));
    
    if (trainingIds.length > 0) {
      navigate(`/trainings/compare?ids=${trainingIds.join(',')}&tab=tests`);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 4
        }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom sx={{
            fontWeight: 700
          }}>
            Test Results
          </Typography>
          <Typography variant="body1" sx={{
            color: "text.secondary"
          }}>
            View and compare model performance test results
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<CompareIcon />}
            onClick={handleCompare}
            disabled={selectedTestResults.size < 2}
            sx={{ 
              px: 3,
              py: 1,
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              '&:hover': { bgcolor: theme.palette.action.hover }
            }}
          >
            Compare Selected ({selectedTestResults.size})
          </Button>
        </Box>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}
      {/* Test Results Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : testResults.length === 0 ? (
        <Typography color="textSecondary">
          No test results found
        </Typography>
      ) : (
        <TableContainer 
          component={Paper} 
          elevation={0} 
          sx={{ 
            borderRadius: 2, 
            border: `1px solid ${theme.palette.divider}`,
            overflow: 'hidden'
          }}
        >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: alpha(theme.palette.primary.main, 0.02) }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedTestResults.size === testResults.length && testResults.length > 0}
                        indeterminate={selectedTestResults.size > 0 && selectedTestResults.size < testResults.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      Training Name
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>
                      Epoch
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg IoU
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg Precision
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg Recall
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg F1
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      mIoU Foreground
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Mean Accuracy
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      FW IoU
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Pixel Accuracy
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Timestamp
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {testResults.map((testResult) => {
                    const avgIou = getAverageMetric(testResult.test_results.day_fair, 'iou') || 
                                   getAverageMetric(testResult.test_results.day_rain, 'iou') || 
                                   getAverageMetric(testResult.test_results.night_fair, 'iou') || 0;
                    const avgPrecision = getAverageMetric(testResult.test_results.day_fair, 'precision') || 
                                        getAverageMetric(testResult.test_results.day_rain, 'precision') || 
                                        getAverageMetric(testResult.test_results.night_fair, 'precision') || 0;
                    const avgRecall = getAverageMetric(testResult.test_results.day_fair, 'recall') || 
                                     getAverageMetric(testResult.test_results.day_rain, 'recall') || 
                                     getAverageMetric(testResult.test_results.night_fair, 'recall') || 0;
                    const avgF1 = getAverageMetric(testResult.test_results.day_fair, 'f1_score') || 
                                 getAverageMetric(testResult.test_results.day_rain, 'f1_score') || 
                                 getAverageMetric(testResult.test_results.night_fair, 'f1_score') || 0;
                    const overallMetrics = getOverallMetrics(testResult.test_results);

                    return (
                      <TableRow 
                        key={testResult._id}
                        hover 
                        sx={{ cursor: testResult.training ? 'pointer' : 'default' }}
                      >
                        <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedTestResults.has(testResult._id)}
                            onChange={(e) => handleSelectTestResult(testResult._id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>
                          {testResult.training ? (
                            <Link 
                              to={`/trainings/${testResult.training._id}?tab=test-results`}
                              style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                              {testResult.training.name || 'Unknown Training'}
                            </Link>
                          ) : (
                            'Unknown Training'
                          )}
                        </TableCell>
                        <TableCell>
                          Epoch {testResult.epoch}
                        </TableCell>
                        <TableCell align="right">{formatNumber(avgIou)}</TableCell>
                        <TableCell align="right">{formatNumber(avgPrecision)}</TableCell>
                        <TableCell align="right">{formatNumber(avgRecall)}</TableCell>
                        <TableCell align="right">{formatNumber(avgF1)}</TableCell>
                        <TableCell align="right">{formatNumber(overallMetrics.mIoU_foreground)}</TableCell>
                        <TableCell align="right">{formatNumber(overallMetrics.mean_accuracy)}</TableCell>
                        <TableCell align="right">{formatNumber(overallMetrics.fw_iou)}</TableCell>
                        <TableCell align="right">{formatNumber(overallMetrics.pixel_accuracy)}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.875rem' }}>
                          {formatDate(testResult.timestamp)}
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {canDeleteTestResults() && (
                            <Tooltip title="Delete">
                              <IconButton size="small" onClick={() => handleDeleteClick(testResult)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Test Result</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this test result? This action cannot be undone.
          </Typography>
          {deleteTarget && (
            <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace' }}>
              Test UUID: {deleteTarget.test_uuid}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TestResultsPage;