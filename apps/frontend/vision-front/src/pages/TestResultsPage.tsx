import { useWriteCapabilities } from '../hooks/useWriteCapabilities';
import React, { useState } from 'react';
import { PageHeader, useCompactLayout, livePalette, tint, ConfirmDialog, ListSkeleton } from '@visin/frontend-core';
import { MobileListHeader, MobileListRow } from '../components/common/MobileList';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import {
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
  IconButton,
  Tooltip,
  Checkbox,
  useTheme
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Compare as CompareIcon,
  Scoreboard as PromoteIcon
} from '@mui/icons-material';
import { testResultService } from '../services/testResultService';
import { TestResult } from '../types';
import { AVERAGED_METRICS, averageAcrossConditions, overallMeans } from '../utils/testResultMetrics';
import { useTaxonomyFor } from '../taxonomy/useTaxonomy';
import MetricName from '../components/common/MetricName';
import PromoteDialog from '../components/evaluations/PromoteDialog';
import { usePageTitle } from '../hooks/usePageTitle';

export const TestResultsPage: React.FC = () => {
  usePageTitle('Test results - Vision');
  const navigate = useNavigate();
  const theme = useTheme();
  const compact = useCompactLayout();
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TestResult | null>(null);
  const [selectedTestResults, setSelectedTestResults] = useState<Set<string>>(new Set());
  const [promoting, setPromoting] = useState<{ id: string; trainingId?: string; epoch: number } | null>(null);
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
  const canDeleteTestResults = useWriteCapabilities('evaluation', testResults.map(row => row._id));

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

  const overallKeys = taxonomy.overallMetrics.map(metric => metric.key);

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
      <PageHeader
        title="Test Results"
        subtitle="View and compare model performance test results"
        // On a phone the compare button floats in once there is something to
        // compare, rather than sitting disabled.
        primaryAction={
          !compact || selectedTestResults.size >= 2
            ? {
                label: `Compare selected (${selectedTestResults.size})`,
                icon: <CompareIcon />,
                onClick: handleCompare,
                disabled: selectedTestResults.size < 2
              }
            : undefined
        }
      />
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
        <ListSkeleton rows={6} label="Loading test results" />
      ) : testResults.length === 0 ? (
        <Typography color="textSecondary">
          No test results found. Either nothing matches your filters, or the runs have not reported any yet: a run reports them from its test stage, after training.
        </Typography>
      ) : compact ? (
          <Paper elevation={0} sx={{ border: `1px solid ${livePalette(theme).divider}`, overflow: 'hidden' }}>
            <MobileListHeader
              selectAll={{
                checked: selectedTestResults.size === testResults.length && testResults.length > 0,
                indeterminate: selectedTestResults.size > 0 && selectedTestResults.size < testResults.length,
                onChange: () => handleSelectAll(selectedTestResults.size !== testResults.length),
                label: 'Select all test results'
              }}
            />
            {testResults.map((testResult) => {
              const averages = AVERAGED_METRICS.map(metric => averageAcrossConditions(testResult.test_results, metric));
              const overallMetrics = overallMeans(testResult.test_results, overallKeys);
              const name = testResult.training?.name || 'Unknown Training';
              return (
                <MobileListRow
                  key={testResult._id}
                  to={testResult.training ? `/trainings/${testResult.training._id}?tab=test-results` : undefined}
                  title={name}
                  selected={selectedTestResults.has(testResult._id)}
                  onToggle={() => handleSelectTestResult(testResult._id, !selectedTestResults.has(testResult._id))}
                  selectLabel={`Select ${name} epoch ${testResult.epoch}`}
                  meta={`Epoch ${testResult.epoch} · ${formatDate(testResult.timestamp)}`}
                  figures={[
                    ...AVERAGED_METRICS.map((metric, index) => ({
                      label: `Avg ${taxonomy.metric(metric).label}`,
                      value: formatNumber(averages[index])
                    })),
                    ...taxonomy.overallMetrics.map(metric => ({
                      label: metric.label,
                      value: formatNumber(overallMetrics[metric.key], metric.decimals)
                    }))
                    // A metric this run did not record is a column of dashes on
                    // desktop; on a phone it is left out.
                  ].filter(figure => figure.value !== '-')}
                  actionsLabel={`Actions for ${name} epoch ${testResult.epoch}`}
                  actions={
                    canDeleteTestResults(testResult._id)
                      ? [
                          { label: 'Rank on a suite', icon: <PromoteIcon fontSize="small" />, onClick: () => setPromoting({ id: testResult._id, trainingId: testResult.training?._id, epoch: testResult.epoch }) },
                          { label: 'Delete', icon: <DeleteIcon fontSize="small" />, onClick: () => handleDeleteClick(testResult), danger: true }
                        ]
                      : []
                  }
                />
              );
            })}
          </Paper>
        ) : (
        <TableContainer 
          component={Paper} 
          elevation={0} 
          sx={{ 
            borderRadius: 2, 
            border: `1px solid ${livePalette(theme).divider}`,
            overflow: 'hidden'
          }}
        >
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: tint(livePalette(theme).primary.main, 0.02) }}>
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
                        <MetricName label={`Avg ${taxonomy.metric(metric).label}`} description={taxonomy.metric(metric).description} />
                      </TableCell>
                    ))}
                    {taxonomy.overallMetrics.map(metric => (
                      <TableCell key={metric.key} align="right" sx={{ fontWeight: 600 }}>
                        <MetricName label={metric.label} description={metric.description} />
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
                      averageAcrossConditions(testResult.test_results, metric)
                    );
                    const overallMetrics = overallMeans(testResult.test_results, overallKeys);

                    return (
                      <TableRow 
                        key={testResult._id}
                        hover
                        onClick={testResult.training ? () => navigate(`/trainings/${testResult.training!._id}?tab=test-results`) : undefined}
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
                              onClick={(event) => event.stopPropagation()}
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
                            <Tooltip title="Rank on a suite">
                              <IconButton size="small" aria-label="Rank on a suite" onClick={() => setPromoting({ id: testResult._id, trainingId: testResult.training?._id, epoch: testResult.epoch })}>
                                <PromoteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
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
      {promoting && (
        <PromoteDialog
          evaluationId={promoting.id}
          source={{ trainingId: promoting.trainingId, epoch: promoting.epoch }}
          onClose={() => setPromoting(null)}
          onPromoted={evaluation => navigate(`/evaluations/${evaluation._id}`)}
        />
      )}
      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete Test Result"
        confirmLabel="Delete"
        busyLabel="Deleting..."
        busy={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
      >
        Are you sure you want to delete this test result? This action cannot be undone.
        {deleteTarget && (
          <Typography variant="body2" component="span" sx={{ display: 'block', mt: 1, fontFamily: 'monospace' }}>
            Test UUID: {deleteTarget.test_uuid}
          </Typography>
        )}
      </ConfirmDialog>
    </Container>
  );
};

export default TestResultsPage;