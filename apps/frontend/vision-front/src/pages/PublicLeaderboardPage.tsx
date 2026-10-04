import { visionApiOrigin } from '../config/visionApi';
import React from 'react';
import {
  Alert,
  Box,
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
import { PageHeader, ShareButton, useCompactLayout } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { MobileListRow } from '../components/common/MobileList';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import { checkpointLabel, formatFixed, publicDataText } from '../components/evaluations/verdict';
import VerificationMark from '../components/evaluations/VerificationMark';
import LeaderboardPagination from '../components/evaluations/LeaderboardPagination';
import LeaderboardExport from '../components/evaluations/LeaderboardExport';
import ObservedSwitch from '../components/evaluations/ObservedSwitch';
import { tableFromPublic } from '../utils/leaderboardExport';
import { useLeaderboardPagination } from '../hooks/useLeaderboardPagination';
import { usePageTitle } from '../hooks/usePageTitle';
import { publicLeaderboardService } from '../services/evaluationService';
import type { PublicSuite } from '../types/evaluation';
import { formatDate, formatDateTime } from '../utils/dateUtils';

const AGGREGATION_TEXT: Record<PublicSuite['aggregation'], string> = {
  'equal-mean-of-conditions': 'the mean of the condition scores',
  'sample-weighted-mean': 'the mean of the condition scores weighted by sample count',
  pooled: 'counted across every sample by the evaluator'
};

/**
 * One public leaderboard. It says how the ranking was formed and what its results are (the submitters' own
 * claims), shows each model's score in every condition and where it is weakest, and leads to the evidence.
 */
const PublicLeaderboardPage: React.FC = () => {
  const compact = useCompactLayout();
  const { slug = '', version = '' } = useParams<{ slug: string; version: string }>();
  usePageTitle(`${slug}@${version} leaderboard`);
  const { page, observed, setPage, setObserved } = useLeaderboardPagination();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-leaderboard', slug, version, page, observed],
    queryFn: () =>
      publicLeaderboardService.get(slug, version, { page, ...(observed ? { evidence: 'observed' as const } : {}) })
  });

  if (isLoading)
    return (
      <Container maxWidth="xl">
        <CircularProgress />
      </Container>
    );
  if (isError || !data) {
    return (
      <Container maxWidth="xl" sx={{ pb: 4 }}>
        <Alert severity="error">{error instanceof Error ? error.message : 'Leaderboard not found'}</Alert>
      </Container>
    );
  }

  const { suite, entries } = data;
  const who = (entry: (typeof entries)[number]) =>
    [
      entry.project?.name,
      formatDate(entry.publishedAt),
      entry.evidenceLevel === 'attested' || entry.evidenceLevel === 'reported' ? entry.evidenceLevel : undefined
    ]
      .filter(Boolean)
      .join(' · ');
  const unit = suite.headline.unit ? ` (${suite.headline.unit})` : '';
  return (
    <Container maxWidth="xl" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Leaderboards', href: '/leaderboards' },
          { label: `${suite.slug}@${suite.version}`, current: true }
        ]}
      />
      <PageHeader
        title={suite.name}
        subtitle={suite.description ?? `${suite.task} · ${suite.slug}@${suite.version}`}
        actions={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShareButton
              url={`${visionApiOrigin().replace(/\/$/, '')}/api/public/share/leaderboards/${encodeURIComponent(suite.slug)}/${suite.version}`}
            />
            {suite.archived && <Chip size="small" color="warning" label="Archived suite" />}
          </Box>
        }
      />
      <Alert severity="info" sx={{ mb: 2 }}>
        These results were reported by whoever submitted them. Visin checks that each fits the protocol; it has not
        verified that the model or data were what they say.
      </Alert>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {suite.headline.direction === 'max' ? 'Higher' : 'Lower'} {suite.headline.key} is better, formed as{' '}
        {AGGREGATION_TEXT[suite.aggregation]}. One row per model, from its latest published result, never its best. Ties
        share a rank. Data: {publicDataText(suite.data)}, split {suite.split}. Updated{' '}
        {formatDateTime(data.generatedAt)}.
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <ObservedSwitch checked={observed} onChange={setObserved} />
        <LeaderboardExport table={tableFromPublic(data)} />
      </Box>
      {entries.length === 0 ? (
        <Alert severity="info">
          {data.pagination?.total
            ? 'No models on this page.'
            : observed
              ? 'No published result here has complete observed evidence. Turn the filter off to see every published result.'
              : 'Nothing is published on this suite right now.'}
        </Alert>
      ) : compact ? (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {entries.map((entry) => (
            <MobileListRow
              key={entry.evaluationId}
              to={`/leaderboards/${suite.slug}/${suite.version}/${entry.evaluationId}`}
              title={`${entry.rank}. ${checkpointLabel(entry.checkpoint)}`}
              meta={
                <>
                  {who(entry)} <VerificationMark verified={Boolean(entry.verifiedAt)} />
                </>
              }
              figures={[
                { label: suite.headline.key, value: formatFixed(entry.headline) },
                { label: 'Worst', value: `${entry.worst.condition} ${formatFixed(entry.worst.value)}` },
                { label: 'Gap', value: formatFixed(entry.gap) }
              ]}
            />
          ))}
        </Paper>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small" aria-label="Leaderboard">
            <TableHead>
              <TableRow>
                <TableCell>Rank</TableCell>
                <TableCell>Model</TableCell>
                <TableCell align="right" sx={{ textTransform: 'none' }}>
                  {suite.headline.key}
                  {unit}
                </TableCell>
                {suite.conditions.map((condition) => (
                  <TableCell key={condition.name} align="right" sx={{ textTransform: 'none' }}>
                    {condition.name}
                  </TableCell>
                ))}
                <TableCell align="right">Worst</TableCell>
                <TableCell align="right">Gap</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.evaluationId} hover>
                  <TableCell>{entry.rank}</TableCell>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/leaderboards/${suite.slug}/${suite.version}/${entry.evaluationId}`}
                    >
                      {checkpointLabel(entry.checkpoint)}
                    </Link>{' '}
                    <VerificationMark verified={Boolean(entry.verifiedAt)} />
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                      {who(entry)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{formatFixed(entry.headline)}</strong>
                  </TableCell>
                  {suite.conditions.map((condition) => (
                    <TableCell key={condition.name} align="right">
                      {entry.conditions[condition.name] === undefined
                        ? '-'
                        : formatFixed(entry.conditions[condition.name])}
                    </TableCell>
                  ))}
                  <TableCell align="right">
                    {entry.worst.condition}: {formatFixed(entry.worst.value)}
                  </TableCell>
                  <TableCell align="right">{formatFixed(entry.gap)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <LeaderboardPagination pagination={data.pagination} onChange={setPage} label="Ranked model pages" />
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          Protocol {suite.digest.slice(0, 12)} · evaluated with {suite.evaluator.package}
          {suite.evaluator.minVersion ? ` ≥ ${suite.evaluator.minVersion}` : ''}
        </Typography>
      </Box>
    </Container>
  );
};

export default PublicLeaderboardPage;
