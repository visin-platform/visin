import { useWriteCapabilities } from '../hooks/useWriteCapabilities';
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
import { TestResult, TestResultData } from '../types';
import { isRecord, readMetric } from '../taxonomy/discover';
import { RESERVED_CLASS_KEYS, RESERVED_CONDITION_KEYS } from '../taxonomy/reserved';
import { useTaxonomyFor } from '../taxonomy/useTaxonomy';

/** Per-class metrics this listing averages into one column each. */
const AVERAGED_METRICS = ['iou', 'precision', 'recall', 'f1_score'];

export const TestResultsPage: React.FC = () => {
  const navigate = useNavigate();
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

  // No project in scope on this listing, so the vocabulary comes from the results
  // themselves — which is exactly the API-fed case.
  const taxonomy = useTaxonomyFor(testResults);

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
  const canDeleteTestResults = useWriteCapabilities('test-result', testResults.map(row => row._id));

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

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  /**
   * Mean of one metric across every class in a condition. Classes come from the
   * payload, so a project with its own vocabulary averages over its own classes.
   */
  const getAverageMetric = (conditionData: unknown, metric: string): number | undefined => {
    if (!isRecord(conditionData)) return undefined;

    const values = Object.entries(conditionData)
      .filter(([key]) => !RESERVED_CLASS_KEYS.has(key))
      .map(([, classData]) => readMetric(classData, metric))
      .filter((value): value is number => value !== undefined);

    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  /**
   * Mean of one metric across every condition of a result. The old version tried
   * three named conditions in turn and took the first truthy answer, so `snow` and
   * `night_rain` never counted and a genuine 0 fell through to the next condition.
   */
  const getAverageAcrossConditions = (testResults: TestResultData, metric: string): number | undefined => {
    if (!isRecord(testResults)) return undefined;

    const values = Object.entries(testResults)
      .filter(([key]) => !RESERVED_CONDITION_KEYS.has(key))
      .map(([, conditionData]) => getAverageMetric(conditionData, metric))
      .filter((value): value is number => value !== undefined);

    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  /** Mean of each summary metric across the conditions that report an `overall`. */
  const getOverallMetrics = (testResults: TestResultData): Record<string, number | undefined> => {
    if (!isRecord(testResults)) return {};

    const blocks = Object.entries(testResults)
      .filter(([key]) => !RESERVED_CONDITION_KEYS.has(key))
      .map(([, conditionData]) => (isRecord(conditionData) ? conditionData.overall : undefined))
      .filter(isRecord);

    // fall back to the top-level `overall` when no condition carries one
    const sources = blocks.length > 0 ? blocks : [testResults.overall].filter(isRecord);

    return Object.fromEntries(
      taxonomy.overallMetrics.map(metric => {
        const values = sources
          .map(block => readMetric(block, metric.key))
          .filter((value): value is number => value !== undefined);
        return [
          metric.key,
          values.length === 0 ? undefined : values.reduce((sum, v) => sum + v, 0) / values.length
        ];
      })
    );
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
                    {AVERAGED_METRICS.map(metric => (
                      <TableCell key={metric} align="right" sx={{ fontWeight: 600 }}>
                        Avg {taxonomy.metric(metric).label}
                      </TableCell>
                    ))}
                    {taxonomy.overallMetrics.map(metric => (
                      <TableCell key={metric.key} align="right" sx={{ fontWeight: 600 }}>
                        {metric.label}
                      </TableCell>
                    ))}
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
                    const averages = AVERAGED_METRICS.map(metric =>
                      getAverageAcrossConditions(testResult.test_results, metric)
                    );
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
                        {AVERAGED_METRICS.map((metric, index) => (
                          <TableCell key={metric} align="right">{formatNumber(averages[index])}</TableCell>
                        ))}
                        {taxonomy.overallMetrics.map(metric => (
                          <TableCell key={metric.key} align="right">
                            {formatNumber(overallMetrics[metric.key], metric.decimals)}
                          </TableCell>
                        ))}
                        <TableCell align="center" sx={{ fontSize: '0.875rem' }}>
                          {formatDate(testResult.timestamp)}
                        </TableCell>
                        <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                          {canDeleteTestResults(testResult._id) && (
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