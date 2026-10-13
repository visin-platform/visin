import React, { useMemo, useState } from 'react';
import { ListSkeleton, useCompactLayout } from '@visin/frontend-core';
import { MobileListHeader, MobileListRow } from '../common/MobileList';
import {
  Box,
  Button,
  Typography,
  TableContainer,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  Checkbox,
  TableBody,
  TablePagination,
  TextField,
  MenuItem,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Compare as CompareIcon } from '@mui/icons-material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { comparisonService } from '../../services/comparisonService';
import { formatDateTime } from '../../utils';
import { TestResult, TestResultsPaginatedResponse } from '../../types';
import { useTaxonomyFor } from '../../taxonomy/useTaxonomy';
import { discoverClassMetrics } from '../../taxonomy/discover';
import {
  AVERAGED_METRICS,
  bestPerRun,
  metricValue,
  type MetricSource,
  type RankableMetric
} from '../../utils/testResultMetrics';

interface ProjectTestsTabProps {
  projectId: string;
  /** Every test result of the project the page loaded, up to its cap. */
  testResultsResponse: TestResultsPaginatedResponse | undefined;
  isLoading: boolean;
}

/** A test result is read on its run's test-results tab. */
const testRunPath = (trainingId: string) => `/trainings/${trainingId}?tab=test-results`;

interface MetricOption extends RankableMetric {
  id: string;
  label: string;
  decimals: number;
}

interface Entry {
  result: TestResult;
  value: number | undefined;
  /** the run's test count, in the one-per-run view */
  tests?: number;
}

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * A project's tests, answering "which run did best?": one row per run, at the
 * test that scored best on a result you choose, ranked. "All tests" lists every
 * one a run reported, for when the run's other epochs are the question.
 */
const ProjectTestsTab: React.FC<ProjectTestsTabProps> = ({ projectId, testResultsResponse, isLoading }) => {
  const compact = useCompactLayout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'best' | 'all'>('best');
  const [chosen, setChosen] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const results = useMemo(() => testResultsResponse?.data?.testResults ?? [], [testResultsResponse]);
  const total = testResultsResponse?.data?.pagination?.total ?? results.length;
  const taxonomy = useTaxonomyFor(results);

  // Only results some test actually reports are offered to rank by.
  const options = useMemo<MetricOption[]>(() => {
    const discovered = discoverClassMetrics(results);
    const classMetrics = [...AVERAGED_METRICS, ...discovered.filter((key) => !AVERAGED_METRICS.includes(key))];
    const candidates: MetricOption[] = [
      ...classMetrics.map((key) => ({
        id: `classes:${key}`,
        key,
        source: 'classes' as MetricSource,
        label: `Avg ${taxonomy.metric(key).label}`,
        decimals: taxonomy.metric(key).decimals
      })),
      ...taxonomy.overallMetrics.map((metric) => ({
        id: `overall:${metric.key}`,
        key: metric.key,
        source: 'overall' as MetricSource,
        label: metric.label,
        decimals: metric.decimals
      }))
    ];
    return candidates.filter((option) => results.some((result) => metricValue(result, option) !== undefined));
  }, [results, taxonomy]);
  // Unless one is chosen, a score where higher is better: ranking runs by a loss first would put the worst-looking figure on top.
  const metric: MetricOption | undefined =
    options.find((option) => option.id === chosen) ??
    options.find((option) => taxonomy.metric(option.key).direction === 'higher') ??
    options[0];

  const entries = useMemo<Entry[]>(() => {
    if (view === 'all') return results.map((result) => ({ result, value: metric ? metricValue(result, metric) : undefined }));
    // With nothing to rank by, a run's row is its newest test, newest runs first.
    if (!metric) return bestPerRun(results, { key: '', source: 'overall' }, () => false);
    return bestPerRun(results, metric, (a, b) => taxonomy.isBetter(metric.key, a, b));
  }, [results, metric, view, taxonomy]);

  // Rank numbers only where there is a ranking.
  const ranked = view === 'best' && metric !== undefined;
  const shown = view === 'all' ? entries.slice(page * rowsPerPage, (page + 1) * rowsPerPage) : entries;
  const allSelected = shown.length > 0 && shown.every(({ result }) => selected.has(result._id));
  const someSelected = shown.some(({ result }) => selected.has(result._id));
  const format = (value: number | undefined) => (value === undefined ? '-' : value.toFixed(metric?.decimals ?? 4));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      for (const { result } of shown) {
        if (allSelected) next.delete(result._id);
        else next.add(result._id);
      }
      return next;
    });

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

  const handleCompare = () => {
    // Unique runs among the chosen tests
    const trainingIds = Array.from(
      new Set(
        results
          .filter((result) => selected.has(result._id))
          .map((result) => result.training?._id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (selected.size > 1 && trainingIds.length > 0) {
      createComparisonMutation.mutate({
        name: `Comparison of ${trainingIds.length} trainings (from test results)`,
        itemIds: trainingIds,
        projectId
      });
    }
  };

  const runName = (result: TestResult) => result.training?.name || 'Unknown';

  const controls = (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={view}
        aria-label="Which tests to list"
        onChange={(_event, next: 'best' | 'all' | null) => {
          if (next) {
            setView(next);
            setPage(0);
          }
        }}
      >
        <ToggleButton value="best">Best per run</ToggleButton>
        <ToggleButton value="all">All tests</ToggleButton>
      </ToggleButtonGroup>
      {options.length > 0 && (
        <TextField
          select
          size="small"
          label="Rank by"
          value={metric?.id ?? ''}
          onChange={(event) => setChosen(event.target.value)}
          sx={{ minWidth: 200 }}
        >
          {options.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Box sx={{ flexGrow: 1 }} />
      {selected.size > 1 && (
        <Button
          variant="outlined"
          startIcon={<CompareIcon />}
          onClick={handleCompare}
          color="primary"
          size="small"
          sx={{ borderRadius: 2 }}
        >
          Compare Selected ({selected.size})
        </Button>
      )}
    </Box>
  );

  const list = (
    <>
      {compact ? (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <MobileListHeader
            selectAll={{
              checked: allSelected,
              indeterminate: someSelected && !allSelected,
              onChange: toggleAll,
              label: 'Select all test results'
            }}
          />
          {shown.map(({ result, value, tests }, index) => (
            <MobileListRow
              key={result._id}
              to={result.training ? testRunPath(result.training._id) : undefined}
              title={ranked ? `${index + 1}. ${runName(result)}` : runName(result)}
              selected={selected.has(result._id)}
              onToggle={() => toggle(result._id)}
              selectLabel={`Select ${runName(result)} epoch ${result.epoch}`}
              meta={`Epoch ${result.epoch} · ${formatDateTime(result.timestamp)}`}
              figures={[
                ...(metric && value !== undefined ? [{ label: metric.label, value: format(value) }] : []),
                ...(tests !== undefined && tests > 1 ? [{ label: 'Tests', value: tests }] : [])
              ]}
            />
          ))}
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someSelected && !allSelected}
                    checked={allSelected}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': 'Select all test results' } }}
                  />
                </TableCell>
                {ranked && <TableCell sx={{ width: 56 }}>Rank</TableCell>}
                <TableCell>Training</TableCell>
                <TableCell>Epoch</TableCell>
                {metric && <TableCell align="right">{metric.label}</TableCell>}
                {view === 'best' && <TableCell align="right">Tests</TableCell>}
                <TableCell>Timestamp</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map(({ result, value, tests }, index) => (
                <TableRow
                  key={result._id}
                  hover={Boolean(result.training)}
                  onClick={result.training ? () => navigate(testRunPath(result.training!._id)) : undefined}
                  sx={{ cursor: result.training ? 'pointer' : 'default' }}
                >
                  <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(result._id)}
                      onChange={() => toggle(result._id)}
                      slotProps={{ input: { 'aria-label': `Select ${runName(result)} epoch ${result.epoch}` } }}
                    />
                  </TableCell>
                  {ranked && <TableCell>{index + 1}</TableCell>}
                  <TableCell>
                    {result.training ? (
                      <RouterLink
                        to={testRunPath(result.training._id)}
                        onClick={(event) => event.stopPropagation()}
                        style={{ color: 'inherit', textDecoration: 'none' }}
                      >
                        {runName(result)}
                      </RouterLink>
                    ) : (
                      'Unknown'
                    )}
                  </TableCell>
                  <TableCell>{result.epoch}</TableCell>
                  {metric && (
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                      {format(value)}
                    </TableCell>
                  )}
                  {view === 'best' && <TableCell align="right">{tests}</TableCell>}
                  <TableCell>{formatDateTime(result.timestamp)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {view === 'all' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <TablePagination
            component="div"
            count={entries.length}
            page={page}
            onPageChange={(_event, next) => setPage(next)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={PAGE_SIZES}
          />
        </Box>
      )}
      {total > results.length && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          Showing the newest {results.length.toLocaleString()} of {total.toLocaleString()} test results.
        </Typography>
      )}
    </>
  );

  return (
    <Box sx={{ px: { xs: 0, sm: 3 } }}>
      <Typography variant="h6" gutterBottom>
        Test Results
      </Typography>
      {isLoading ? (
        <ListSkeleton rows={5} label="Loading test results" />
      ) : results.length > 0 ? (
        <>
          {controls}
          {list}
        </>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          No test results yet. A run reports them from its test stage, after training, so runs that are still going or
          skipped it have none.
        </Typography>
      )}
    </Box>
  );
};

export default ProjectTestsTab;
