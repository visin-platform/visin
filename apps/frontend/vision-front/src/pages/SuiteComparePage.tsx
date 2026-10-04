import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Link,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { checkpointLabel } from '../components/evaluations/sources';
import { evidenceLabel, formatFixed } from '../components/evaluations/verdict';
import { usePageTitle } from '../hooks/usePageTitle';
import { evaluationService, suiteService } from '../services/evaluationService';
import type { Evaluation } from '../types/evaluation';
import { compareEvaluations, NotComparable, OVERALL, suiteMetrics, type EvaluationComparison, type ScoreVerdict } from '../utils/evaluationComparison';

const VERDICT: Record<ScoreVerdict, { label: string; color: 'success' | 'error' | 'default' | 'warning' }> = {
  better: { label: 'Better', color: 'success' },
  worse: { label: 'Worse', color: 'error' },
  same: { label: 'Same', color: 'default' },
  missing: { label: 'Missing', color: 'warning' }
};

const signed = (value: number) => `${value > 0 ? '+' : ''}${formatFixed(value)}`;
const cell = (value: number | undefined) => (value === undefined ? '—' : formatFixed(value));

const Side: React.FC<{ evaluation: Evaluation; label: string }> = ({ evaluation, label }) => (
  <Box>
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{label}</Typography>
    <Link component={RouterLink} to={`/evaluations/${evaluation._id}`}>{checkpointLabel(evaluation.checkpoint)}</Link>
    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
      Evidence: {evidenceLabel(evaluation.validation.evidence).toLowerCase()}
    </Typography>
  </Box>
);

const ComparisonTable: React.FC<{ comparison: EvaluationComparison }> = ({ comparison }) => (
  <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
    <Table size="small" aria-label="Comparison">
      <TableHead>
        <TableRow>
          <TableCell>Condition</TableCell>
          <TableCell align="right">First</TableCell>
          <TableCell align="right">Second</TableCell>
          <TableCell align="right">Change</TableCell>
          <TableCell>Second is</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {comparison.rows.map(row => (
          <TableRow key={row.scope}>
            <TableCell component="th" scope="row">{row.scope === OVERALL ? 'Overall' : row.scope}</TableCell>
            <TableCell align="right">{cell(row.baseline)}</TableCell>
            <TableCell align="right">{cell(row.candidate)}</TableCell>
            <TableCell align="right">{row.delta === undefined ? '—' : signed(row.delta)}</TableCell>
            <TableCell><Chip size="small" variant="outlined" color={VERDICT[row.verdict].color} label={VERDICT[row.verdict].label} /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </TableContainer>
);

/**
 * Two checkpoints of one suite version side by side: the overall figure and each condition on one metric, in the
 * metric's own direction, from the same scores the ranking uses. A condition one side has no score in is shown as
 * missing, never as a zero, and results on different suite versions are refused.
 */
const SuiteComparePage: React.FC = () => {
  const { slug = '', version = '' } = useParams<{ slug: string; version: string }>();
  const [params, setParams] = useSearchParams();
  const first = params.get('a') ?? '';
  const second = params.get('b') ?? '';
  const metricKey = params.get('metric') ?? undefined;
  usePageTitle(`Compare on ${slug}@${version}`);

  const ready = Boolean(first && second && first !== second);
  const suite = useQuery({ queryKey: ['suite', slug, version], queryFn: () => suiteService.get(slug, version), enabled: ready });
  const a = useQuery({ queryKey: ['evaluation', first], queryFn: () => evaluationService.get(first), enabled: ready });
  const b = useQuery({ queryKey: ['evaluation', second], queryFn: () => evaluationService.get(second), enabled: ready });
  const crumbs = [{ label: 'Suites', href: '/suites' }, { label: `${slug}@${version}`, href: `/suites/${slug}/${version}` }, { label: 'Compare', current: true }];

  const body = (() => {
    if (!ready) {
      return <Alert severity="info">Pick two different checkpoints from the ranking to compare them.</Alert>;
    }
    const failure = suite.error ?? a.error ?? b.error;
    if (suite.isError || a.isError || b.isError) {
      return <Alert severity="error">{failure instanceof Error ? failure.message : 'Failed to load the comparison'}</Alert>;
    }
    if (!suite.data || !a.data || !b.data) return <CircularProgress />;
    let comparison: EvaluationComparison;
    try {
      comparison = compareEvaluations(suite.data, a.data, b.data, metricKey);
    } catch (error) {
      if (error instanceof NotComparable) return <Alert severity="error">{error.message}</Alert>;
      throw error;
    }
    const { metric, coverage } = comparison;
    return (
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Alert severity="info">
          Compared on {metric.key}{metric.unit ? ` (${metric.unit})` : ''}, {metric.direction === 'max' ? 'higher' : 'lower'} is better, from the scores the ranking
          uses. Only results on this suite version can be compared.
        </Alert>
        {comparison.problems.map(problem => <Alert key={problem} severity="warning">{problem}</Alert>)}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <Side evaluation={a.data} label="First (the baseline)" />
          <Side evaluation={b.data} label="Second" />
        </Box>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            select
            size="small"
            label="Metric"
            value={metric.key}
            onChange={event => setParams(previous => { const next = new URLSearchParams(previous); next.set('metric', event.target.value); return next; })}
            sx={{ minWidth: 200 }}
          >
            {suiteMetrics(suite.data).map(item => <MenuItem key={item.key} value={item.key}>{item.key}{item.headline ? ' (headline)' : ''}</MenuItem>)}
          </TextField>
          <Button size="small" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('a', second); next.set('b', first); return next; })}>
            Swap
          </Button>
        </Box>
        <ComparisonTable comparison={comparison} />
        <Typography variant="body2" color="text.secondary">
          The suite declares {coverage.declared.length} condition{coverage.declared.length === 1 ? '' : 's'}. The first has a score in {coverage.baseline.length}, the second in {coverage.candidate.length}.
        </Typography>
      </Box>
    );
  })();

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      <PageBreadcrumbs items={crumbs} />
      <PageHeader title="Compare two checkpoints" subtitle={`${slug}@${version}`} />
      {body}
    </Container>
  );
};

export default SuiteComparePage;
