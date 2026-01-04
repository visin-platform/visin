import React, { useState, useEffect } from 'react';
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
import { TestResult, TestResultData, TestResultMetrics } from '../types';
import { useAuth } from '../contexts/AuthContext';

export const TestResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);
  const [selectedTestResults, setSelectedTestResults] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadTestResults();
  }, []);

  // Check if user has permission to delete test results (owner or admin role)
  const canDeleteTestResults = () => {
    if (!isAuthenticated || !user) return false;
    return user.groups.some(group => group.includes('owner') || group.includes('admin'));
  };

  const loadTestResults = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await testResultService.getTestResults();
      const testResultsData = response.data.testResults || [];
      setTestResults(testResultsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test results');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (testResult: TestResult) => {
    setDeleteTarget(testResult);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      setLoading(true);
      await testResultService.deleteTestResult(deleteTarget._id);
      setSuccess('Test result deleted successfully');
      loadTestResults();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete test result');
    } finally {
      setLoading(false);
      setDeleteOpen(false);
      setDeleteTarget(null);
    }
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
    const classNames: string[] = ['vehicle', 'sign', 'human', 'cyclist + pedestrian'];
    const validClasses = classNames.filter(className => {
      const classData = (conditionData as any)[className];
      return classData && typeof classData === 'object' && (
        metric in classData ||
        (metric === 'f1_score' && ('f1' in classData || 'mean_f1' in classData))
      );
    });

    if (validClasses.length === 0) return 0;

    const sum = validClasses.reduce((acc, className) => {
      const classData = (conditionData as any)[className] as TestResultMetrics;
      // Handle different F1 field names: f1_score, f1, or mean_f1
      const value = metric === 'f1_score' ?
        (classData.f1_score || classData.f1 || classData.mean_f1) :
        classData[metric];
      return acc + (value || 0);
    }, 0);

    return sum / validClasses.length;
  };

  const getOverallAverage = (testResults: TestResultData, metric: keyof TestResultMetrics): number => {
    const conditions = Object.values(testResults);
    const sum = conditions.reduce((acc, condition) => acc + getAverageMetric(condition, metric), 0);
    return sum / conditions.length;
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={700} gutterBottom>
            Test Results
          </Typography>
          <Typography variant="body1" color="text.secondary">
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
                      Avg Recall
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Avg F1
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
                    const avgIou = getOverallAverage(testResult.test_results, 'iou');
                    const avgRecall = getOverallAverage(testResult.test_results, 'recall');
                    const avgF1 = getOverallAverage(testResult.test_results, 'f1_score');

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
                        <TableCell align="right">{formatNumber(avgRecall)}</TableCell>
                        <TableCell align="right">{formatNumber(avgF1)}</TableCell>
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