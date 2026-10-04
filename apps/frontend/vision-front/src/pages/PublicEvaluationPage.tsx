import React from 'react';
import { Alert, Box, CircularProgress, Container, Link, Paper, Typography } from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import VerificationMark from '../components/evaluations/VerificationMark';
import ScoresTable from '../components/evaluations/ScoresTable';
import { checkpointLabel, EVIDENCE_META, publicDataText } from '../components/evaluations/verdict';
import { checkpointSource } from '../components/evaluations/sources';
import { usePageTitle } from '../hooks/usePageTitle';
import { publicLeaderboardService } from '../services/evaluationService';
import type { PublicEvaluation } from '../types/evaluation';
import { formatDateTime } from '../utils/dateUtils';

/** The evidence behind one public entry: its scores, the checkpoint, the samples and the evaluator. Nothing else is public. */
/** The checkpoint as a link to where it lives, or its label and identifying fact when it cannot be opened. */
const CheckpointFact: React.FC<{ checkpoint: PublicEvaluation['checkpoint'] }> = ({ checkpoint }) => {
  if (!checkpoint) return <>Not given</>;
  const source = checkpointSource(checkpoint);
  const href = source.href?.(checkpoint);
  if (href) return <Link href={href} target="_blank" rel="noopener noreferrer">{source.label(checkpoint)}</Link>;
  return <>{[source.label(checkpoint), source.detail?.(checkpoint)].filter(Boolean).join(' · ')}</>;
};

const PublicEvaluationPage: React.FC = () => {
  const { slug = '', version = '', id = '' } = useParams<{ slug: string; version: string; id: string }>();
  usePageTitle('Published result');
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['public-evaluation', id],
    queryFn: () => publicLeaderboardService.evaluation(id)
  });

  if (isLoading) return <Container maxWidth="lg"><CircularProgress /></Container>;
  if (isError || !data) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">{error instanceof Error ? error.message : 'Result not found'}</Alert>
      </Container>
    );
  }

  const { checkpoint, suite } = data;
  // An address names the suite as well as the result: the one a result belongs to is the only one that shows it.
  if (suite.slug !== slug || String(suite.version) !== version) {
    return <Navigate to={`/leaderboards/${suite.slug}/${suite.version}/${data.evaluationId}`} replace />;
  }
  const rows: [string, React.ReactNode][] = [
    ['Suite', <Link key="s" component={RouterLink} to={`/leaderboards/${suite.slug}/${suite.version}`}>{suite.name} · {suite.slug}@{suite.version}</Link>],
    ['Protocol', `${suite.digest.slice(0, 12)} · ${suite.task} · ${publicDataText(suite.data)}, split ${suite.split}`],
    ['Checkpoint', <CheckpointFact key="c" checkpoint={checkpoint} />],
    ...(data.sampleCounts ? [['Samples', Object.entries(data.sampleCounts).map(([name, count]) => `${name} ${count}`).join(' · ')] as [string, React.ReactNode]] : []),
    ...(data.evaluator ? [['Evaluator', [data.evaluator.package, data.evaluator.version, data.evaluator.commit && `(${data.evaluator.commit})`].filter(Boolean).join(' ')] as [string, React.ReactNode]] : []),
    ['Evidence level', `${EVIDENCE_META[data.evidenceLevel ?? 'none'].label}. ${EVIDENCE_META[data.evidenceLevel ?? 'none'].meaning}`],
    ...(data.project ? [['Submitted by', data.project.name] as [string, React.ReactNode]] : []),
    ...(data.executedAt ? [['Ran', formatDateTime(data.executedAt)] as [string, React.ReactNode]] : []),
    ['Published', formatDateTime(data.publishedAt)],
    ['Verification', <VerificationMark key="verification" verified={Boolean(data.verifiedAt)} />]
  ];

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      <PageBreadcrumbs
        items={[
          { label: 'Leaderboards', href: '/leaderboards' },
          { label: `${slug}@${version}`, href: `/leaderboards/${slug}/${version}` },
          { label: checkpointLabel(checkpoint), current: true }
        ]}
      />
      <PageHeader title={checkpointLabel(checkpoint)} subtitle={`Published result on ${suite.slug}@${suite.version}`} />
      <Alert severity="info" sx={{ mb: 3 }}>
        Reported by whoever submitted it. Visin checked that it fits the protocol; it has not verified the checkpoint or the data.
      </Alert>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
        {data.scores && (
          <section aria-labelledby="scores-heading">
            <Typography id="scores-heading" variant="h6" gutterBottom>Scores</Typography>
            <ScoresTable scores={data.scores} />
          </section>
        )}
        <section aria-labelledby="evidence-heading">
          <Typography id="evidence-heading" variant="h6" gutterBottom>Evidence</Typography>
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
        </section>
      </Box>
    </Container>
  );
};

export default PublicEvaluationPage;
