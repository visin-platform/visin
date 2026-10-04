import React from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { PageHeader, useCompactLayout } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { MobileListRow } from '../components/common/MobileList';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import VerdictChip from '../components/evaluations/VerdictChip';
import { checkpointLabel, formatFixed, reasonText } from '../components/evaluations/verdict';
import { describeData } from '../components/evaluations/sources';
import LeaderboardPagination from '../components/evaluations/LeaderboardPagination';
import LeaderboardExport from '../components/evaluations/LeaderboardExport';
import ObservedSwitch from '../components/evaluations/ObservedSwitch';
import SubmissionsPanel from '../components/evaluations/SubmissionsPanel';
import { SUBMISSION_POLICIES } from '../components/evaluations/submissionPolicies';
import { useLeaderboardPagination } from '../hooks/useLeaderboardPagination';
import { usePageTitle } from '../hooks/usePageTitle';
import { suiteService } from '../services/evaluationService';
import type { Leaderboard, Suite } from '../types/evaluation';
import { formatDate } from '../utils';
import { tableFromBoard } from '../utils/leaderboardExport';

const AGGREGATION_TEXT: Record<Suite['protocol']['aggregation'], string> = {
  'equal-mean-of-conditions': 'The mean of the condition scores, computed by Visin',
  'sample-weighted-mean': 'The mean of the condition scores weighted by sample count, computed by Visin',
  pooled: 'Counted across every sample by the evaluator'
};

const ProtocolSummary: React.FC<{ suite: Suite }> = ({ suite }) => {
  const { protocol } = suite;
  const headline = protocol.metrics.find(metric => metric.headline);
  const rows: [string, React.ReactNode][] = [
    ['Task', protocol.task],
    ['Data', `${describeData(protocol.data)} · split ${protocol.split}`],
    ['Conditions', protocol.conditions.map(condition => `${condition.name} (${condition.sampleCount})`).join(', ')],
    ['Headline', headline ? `${headline.key} · ${headline.direction === 'max' ? 'higher' : 'lower'} is better${headline.unit ? ` · ${headline.unit}` : ''}` : '-'],
    ['Other metrics', protocol.metrics.filter(metric => !metric.headline).map(metric => metric.key).join(', ') || 'None'],
    ['Overall figure', AGGREGATION_TEXT[protocol.aggregation]],
    ['Evaluator', `${protocol.evaluator.package}${protocol.evaluator.minVersion ? ` ≥ ${protocol.evaluator.minVersion}` : ''}`],
    ['Publishing', SUBMISSION_POLICIES.find(item => item.value === suite.submissions)?.summary ?? 'A manager of any public project can publish its results here.'],
    ['Protocol digest', suite.digest]
  ];
  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: 1, m: 0 }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
          </React.Fragment>
        ))}
      </Box>
    </Paper>
  );
};

interface Selection {
  /** evaluation ids picked to compare, at most two */
  ids: string[];
  toggle: (id: string) => void;
}

const Ranking: React.FC<{ board: Leaderboard; observed: boolean; selection: Selection }> = ({ board, observed, selection }) => {
  const compact = useCompactLayout();
  const { headline } = board.suite;
  const unit = headline.unit ? ` (${headline.unit})` : '';
  if (board.entries.length === 0) {
    return (
      <Alert severity="info">
        {board.pagination?.total
          ? 'No ranked checkpoints on this page.'
          : observed
            ? 'No result here has complete observed evidence. Turn the filter off to see every ranked result.'
            : 'Nothing is ranked yet. Record results on this suite, or promote older test results onto it.'}
      </Alert>
    );
  }
  const who = (entry: Leaderboard['entries'][number]) =>
    [entry.project?.name, formatDate(entry.receivedAt), entry.evidenceLevel === 'attested' || entry.evidenceLevel === 'reported' ? entry.evidenceLevel : undefined].filter(Boolean).join(' · ');

  if (compact) {
    return (
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        {board.entries.map(entry => (
          <MobileListRow
            key={entry.evaluationId}
            to={`/evaluations/${entry.evaluationId}`}
            title={`${entry.rank}. ${checkpointLabel(entry.checkpoint)}`}
            meta={who(entry)}
            figures={[
              { label: headline.key, value: formatFixed(entry.summary.headline.value) },
              { label: 'Worst', value: `${entry.summary.worst.condition} ${formatFixed(entry.summary.worst.value)}` },
              { label: 'Gap', value: formatFixed(entry.summary.gap) },
              { label: 'Attempts', value: String(entry.attempts) }
            ]}
          />
        ))}
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Table size="small" aria-label="Ranking">
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox"><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Select to compare</span></TableCell>
            <TableCell>Rank</TableCell>
            <TableCell>Checkpoint</TableCell>
            <TableCell align="right" sx={{ textTransform: 'none' }}>{headline.key}{unit}</TableCell>
            <TableCell align="right">Worst condition</TableCell>
            <TableCell align="right">Gap</TableCell>
            <TableCell align="right">Attempts</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {board.entries.map(entry => (
            <TableRow key={entry.evaluationId} hover selected={selection.ids.includes(entry.evaluationId)}>
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={selection.ids.includes(entry.evaluationId)}
                  disabled={!selection.ids.includes(entry.evaluationId) && selection.ids.length >= 2}
                  onChange={() => selection.toggle(entry.evaluationId)}
                  slotProps={{ input: { 'aria-label': `Select ${checkpointLabel(entry.checkpoint)} to compare` } }}
                />
              </TableCell>
              <TableCell>{entry.rank}</TableCell>
              <TableCell>
                <Link component={RouterLink} to={`/evaluations/${entry.evaluationId}`}>{checkpointLabel(entry.checkpoint)}</Link>
                <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{who(entry)}</Typography>
              </TableCell>
              <TableCell align="right">{formatFixed(entry.summary.headline.value)}</TableCell>
              <TableCell align="right">{entry.summary.worst.condition}: {formatFixed(entry.summary.worst.value)}</TableCell>
              <TableCell align="right">{formatFixed(entry.summary.gap)}</TableCell>
              <TableCell align="right">{entry.attempts}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

const Unranked: React.FC<{ board: Leaderboard }> = ({ board }) => {
  const compact = useCompactLayout();
  if (board.unranked.length === 0) return null;
  return (
    <section aria-labelledby="unranked-heading">
      <Typography id="unranked-heading" variant="h6" gutterBottom>Not ranked</Typography>
      {compact ? (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {board.unranked.map(row => (
            <MobileListRow
              key={row.evaluationId}
              to={`/evaluations/${row.evaluationId}`}
              title={checkpointLabel(row.checkpoint)}
              meta={<VerdictChip validation={{ version: 1, state: row.state, reasons: row.reasons, warnings: [] }} />}
              footer={row.reasons.map(reasonText).join(' ')}
            />
          ))}
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small" aria-label="Not ranked">
            <TableHead>
              <TableRow>
                <TableCell>Checkpoint</TableCell>
                <TableCell>Verdict</TableCell>
                <TableCell>Why</TableCell>
                <TableCell align="right">Attempts</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {board.unranked.map(row => (
                <TableRow key={row.evaluationId}>
                  <TableCell>
                    <Link component={RouterLink} to={`/evaluations/${row.evaluationId}`}>{checkpointLabel(row.checkpoint)}</Link>
                  </TableCell>
                  <TableCell>
                    <VerdictChip validation={{ version: 1, state: row.state, reasons: row.reasons, warnings: [] }} />
                  </TableCell>
                  <TableCell>{row.reasons.map(reasonText).join(' ')}</TableCell>
                  <TableCell align="right">{row.attempts}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </section>
  );
};

/**
 * One suite version: what it measures, and the checkpoints scored on it in order. A rank is a position among
 * the evaluations the viewer can read, and the page says how many that is.
 */
const SuitePage: React.FC = () => {
  const { slug = '', version = '' } = useParams<{ slug: string; version: string }>();
  usePageTitle(`${slug}@${version}`);
  const { page, unrankedPage, observed, setPage, setObserved } = useLeaderboardPagination();
  const navigate = useNavigate();
  const [picked, setPicked] = React.useState<string[]>([]);
  const selection: Selection = {
    ids: picked,
    toggle: id => setPicked(previous => (previous.includes(id) ? previous.filter(item => item !== id) : previous.length < 2 ? [...previous, id] : previous))
  };

  const suite = useQuery({ queryKey: ['suite', slug, version], queryFn: () => suiteService.get(slug, version) });
  const board = useQuery({ queryKey: ['leaderboard', slug, version, page, unrankedPage, observed], queryFn: () => suiteService.leaderboard(slug, version, { page, unrankedPage, ...(observed ? { evidence: 'observed' as const } : {}) }) });

  if (suite.isLoading || board.isLoading) return <Container maxWidth="xl"><CircularProgress /></Container>;
  if (suite.isError || !suite.data || board.isError || !board.data) {
    const failure = suite.error ?? board.error;
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Alert severity="error">{failure instanceof Error ? failure.message : 'Suite not found'}</Alert>
      </Container>
    );
  }

  const direction = board.data.suite.headline.direction === 'max' ? 'Higher' : 'Lower';
  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs items={[{ label: 'Suites', href: '/suites' }, { label: `${suite.data.slug}@${suite.data.version}`, current: true }]} />
      <PageHeader
        title={suite.data.name}
        subtitle={suite.data.description ?? `${suite.data.slug}@${suite.data.version}`}
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip size="small" label={suite.data.visibility === 'public' ? 'Public' : 'Private'} />
            {suite.data.archivedAt && <Chip size="small" color="warning" label="Archived" />}
          </Box>
        }
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
        <section aria-labelledby="ranking-heading">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography id="ranking-heading" variant="h6" gutterBottom>Ranking</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" disabled={picked.length !== 2} onClick={() => navigate(`/suites/${slug}/${version}/compare?a=${picked[0]}&b=${picked[1]}`)}>
                Compare{picked.length > 0 ? ` (${picked.length} of 2)` : ''}
              </Button>
              <LeaderboardExport table={tableFromBoard(board.data)} />
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {direction} {board.data.suite.headline.key} is better. One row per checkpoint, from its latest ranked attempt, never its best.
            Ranked among the {board.data.scope.candidates} evaluation{board.data.scope.candidates === 1 ? '' : 's'} of this suite you can read
            {board.data.scope.truncated ? ' (the most recent; there are more)' : ''}. Ties share a rank.
          </Typography>
          <ObservedSwitch checked={observed} onChange={setObserved} />
          <Ranking board={board.data} observed={observed} selection={selection} />
          <LeaderboardPagination pagination={board.data.pagination} onChange={setPage} label="Ranked checkpoint pages" />
        </section>
        <Box>
          <Unranked board={board.data} />
          <LeaderboardPagination pagination={board.data.unrankedPagination} onChange={page => setPage(page, 'unrankedPage')} label="Unranked checkpoint pages" />
        </Box>
        <section aria-labelledby="protocol-heading">
          <Typography id="protocol-heading" variant="h6" gutterBottom>Protocol</Typography>
          <ProtocolSummary suite={suite.data} />
        </section>
        {suite.data.visibility === 'public' && <SubmissionsPanel suite={suite.data} />}
      </Box>
    </Container>
  );
};

export default SuitePage;
