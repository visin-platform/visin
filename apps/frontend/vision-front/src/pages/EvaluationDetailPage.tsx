import React, { useState } from 'react';
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link,
  Paper,
  Typography
} from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { Chip } from '@mui/material';
import { PageHeader } from '@visin/frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import ReasonList from '../components/evaluations/ReasonList';
import ScoresTable from '../components/evaluations/ScoresTable';
import EvidenceChip from '../components/evaluations/EvidenceChip';
import EvidencePanel from '../components/evaluations/EvidencePanel';
import ResultsTable from '../components/evaluations/ResultsTable';
import VerificationMark from '../components/evaluations/VerificationMark';
import VerdictChip from '../components/evaluations/VerdictChip';
import { checkpointLabel } from '../components/evaluations/verdict';
import { checkpointSource } from '../components/evaluations/sources';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { evaluationService } from '../services/evaluationService';
import type { Evaluation } from '../types/evaluation';
import { formatDateTime } from '../utils/dateUtils';

const Facts: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px 1fr' }, gap: 1, m: 0 }}>
    {rows.map(([label, value]) => (
      <React.Fragment key={label}>
        <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
      </React.Fragment>
    ))}
  </Box>
);

const CheckpointFact: React.FC<{ evaluation: Evaluation }> = ({ evaluation }) => {
  const { checkpoint } = evaluation;
  if (!checkpoint) return <>Not recorded</>;
  const source = checkpointSource(checkpoint);
  const href = source.href?.(checkpoint);
  if (href) {
    return <Link href={href} target="_blank" rel="noopener noreferrer">{source.label(checkpoint)}</Link>;
  }
  const note = [source.note, source.detail?.(checkpoint)].filter(Boolean).join(' · ');
  return (
    <>
      {source.label(checkpoint)}
      {note && <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>{note}</Typography>}
    </>
  );
};

const Json: React.FC<{ value: unknown; label: string }> = ({ value, label }) => (
  <Box component="pre" aria-label={`${label} (JSON)`} sx={{ m: 0, p: 1.5, overflow: 'auto', fontSize: '0.8rem', bgcolor: 'action.hover', borderRadius: 1 }}>
    {JSON.stringify(value, null, 2)}
  </Box>
);

const EvaluationDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [confirm, setConfirm] = useState(false);
  usePageTitle('Evaluation');

  const { data: evaluation, isLoading, isError, error } = useQuery({
    queryKey: ['evaluation', id],
    queryFn: () => evaluationService.get(id)
  });
  const publication = useMutation({
    mutationFn: (publish: boolean) => (publish ? evaluationService.publish(id) : evaluationService.withdraw(id)),
    onSuccess: updated => {
      queryClient.setQueryData(['evaluation', id], (previous: Evaluation | undefined) => (previous ? { ...previous, publishedAt: updated.publishedAt } : previous));
      queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['public-leaderboards'] });
    }
  });
  const verification = useMutation({
    mutationFn: (verified: boolean) => evaluationService.verify(id, verified),
    onSuccess: updated => {
      queryClient.setQueryData(['evaluation', id], (previous: Evaluation | undefined) => previous ? { ...previous, verifiedAt: updated.verifiedAt, verifiedBy: updated.verifiedBy } : previous);
      queryClient.invalidateQueries({ queryKey: ['recorded-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    }
  });
  const trash = useMutation({
    mutationFn: () => evaluationService.trash(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['recorded-leaderboard'] });
      navigate('/evaluations');
    }
  });

  if (isLoading) return <Container maxWidth="lg"><CircularProgress /></Container>;
  if (isError || !evaluation) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error">{error instanceof Error ? error.message : 'Evaluation not found'}</Alert>
      </Container>
    );
  }

  const suite = evaluation.suite;
  const promoted = evaluation.provenance?.promoted as { evaluationId?: string } | undefined;
  const { provenance, results } = evaluation;
  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      <PageBreadcrumbs items={[{ label: 'Evaluations', href: '/evaluations' }, { label: checkpointLabel(evaluation.checkpoint), current: true }]} />
      <PageHeader
        title={checkpointLabel(evaluation.checkpoint)}
        subtitle={suite ? `Scored on ${suite.slug}@${suite.version}` : 'Not scored on a suite'}
        actions={
          isAuthenticated ? (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flexDirection: { xs: 'column', sm: 'row' } }}>
              <Button variant="outlined" disabled={verification.isPending} onClick={() => verification.mutate(!evaluation.verifiedAt)}>
                {evaluation.verifiedAt ? 'Remove verification' : 'Mark verified'}
              </Button>
              {evaluation.validation.state === 'eligible' && (
                <Button
                  variant="outlined"
                  onClick={() => publication.mutate(!evaluation.publishedAt)}
                  disabled={publication.isPending}
                >
                  {evaluation.publishedAt ? 'Withdraw from public leaderboard' : 'Publish to public leaderboard'}
                </Button>
              )}
              <Button color="error" variant="outlined" onClick={() => setConfirm(true)}>Move to trash</Button>
            </Box>
          ) : undefined
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3 }}>
        {publication.isError && (
          <Alert severity="error">{publication.error instanceof Error ? publication.error.message : 'Failed to change publication'}</Alert>
        )}
        {evaluation.hidden && (
          <Alert severity="warning">
            A manager of the suite hid this result from its leaderboard{evaluation.hidden.reason ? `: ${evaluation.hidden.reason}` : '.'} It cannot be published again until they show it.
          </Alert>
        )}
        {evaluation.supersededById && (
          <Alert severity="info" action={<Button color="inherit" size="small" component={RouterLink} to={`/evaluations/${evaluation.supersededById}`}>See the correction</Button>}>
            A correction replaces this result. It is no longer ranked, and cannot be published.
          </Alert>
        )}
        {evaluation.publishedAt && !evaluation.hidden && suite && (
          <Alert severity="info" action={<Button color="inherit" size="small" component={RouterLink} to={`/leaderboards/${suite.slug}/${suite.version}/${evaluation._id}`}>See public page</Button>}>
            <Chip size="small" label="Public" sx={{ mr: 1 }} />
            Published {formatDateTime(evaluation.publishedAt)}. Anyone can see this result’s scores, checkpoint and sample counts, and nothing else from it.
          </Alert>
        )}
        {verification.isError && <Alert severity="error">{verification.error instanceof Error ? verification.error.message : 'Could not change verification'}</Alert>}
        <Box><VerificationMark verified={Boolean(evaluation.verifiedAt)} />{evaluation.verifiedAt && <Typography variant="caption" sx={{ ml: 1 }}>{formatDateTime(evaluation.verifiedAt)}</Typography>}</Box>
        <section aria-labelledby="verdict-heading">
          <Typography id="verdict-heading" variant="h6" gutterBottom>
            Verdict <VerdictChip validation={evaluation.validation} /> <EvidenceChip level={evaluation.validation.evidence} />
          </Typography>
          <ReasonList validation={evaluation.validation} />
        </section>

        <section aria-labelledby="reported-heading">
          <Typography id="reported-heading" variant="h6" gutterBottom>What the evaluator reported</Typography>
          <EvidencePanel evaluation={evaluation} />
        </section>

        {evaluation.validation.scores && (
          <section aria-labelledby="scores-heading">
            <Typography id="scores-heading" variant="h6" gutterBottom>Scores that are ranked</Typography>
            <ScoresTable scores={evaluation.validation.scores} />
          </section>
        )}

        <section aria-labelledby="evidence-heading">
          <Typography id="evidence-heading" variant="h6" gutterBottom>Evidence</Typography>
          <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
            <Facts
              rows={[
                ['Suite', suite ? (
                  <>
                    <Link component={RouterLink} to={`/suites/${suite.slug}/${suite.version}`}>{suite.slug}@{suite.version}</Link>
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>protocol {suite.digest.slice(0, 12)}</Typography>
                  </>
                ) : 'None'],
                ['Checkpoint', <CheckpointFact key="cp" evaluation={evaluation} />],
                ...(evaluation.source?.trainingId
                  ? [['Source run', (
                      <>
                        <Link component={RouterLink} to={`/trainings/${evaluation.source.trainingId}`}>Open the run</Link>
                        {evaluation.source.epoch !== undefined ? `, epoch ${evaluation.source.epoch}` : ''}
                      </>
                    )] as [string, React.ReactNode]]
                  : []),
                ...(promoted ? [['Promoted from', 'A result recorded without this suite, copied unchanged'] as [string, React.ReactNode]] : []),
                ...(evaluation.sampleCounts
                  ? [['Samples', Object.entries(evaluation.sampleCounts).map(([name, count]) => `${name} ${count}`).join(' · ')] as [string, React.ReactNode]]
                  : []),
                ...(evaluation.executedAt ? [['Ran', formatDateTime(evaluation.executedAt)] as [string, React.ReactNode]] : []),
                ['Recorded', formatDateTime(evaluation.receivedAt)]
              ]}
            />
          </Paper>
        </section>

        {provenance && (
          <section aria-labelledby="provenance-heading">
            <Typography id="provenance-heading" variant="h6" gutterBottom>Provenance</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Reported by whoever submitted this result. Visin checks that results fit the suite; it cannot prove which checkpoint or data were used.
            </Typography>
            <Json value={provenance} label="Provenance" />
          </section>
        )}

        {results && (
          <section aria-labelledby="reported-results-heading">
            <Typography id="reported-results-heading" variant="h6" gutterBottom>Results by condition and class</Typography>
            <ResultsTable results={results} />
          </section>
        )}

        {results && (
          <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
            <AccordionSummary expandIcon={<ExpandIcon />}>
              <Typography variant="subtitle1">Raw results</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Json value={results} label="Raw results" />
            </AccordionDetails>
          </Accordion>
        )}
      </Box>

      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Move this evaluation to the trash?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            It leaves every list and leaderboard. A manager can restore it. Results never change, so this does not edit them.
          </DialogContentText>
          {trash.isError && <Alert severity="error" sx={{ mt: 2 }}>{trash.error instanceof Error ? trash.error.message : 'Failed to move it'}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button color="error" onClick={() => trash.mutate()} disabled={trash.isPending}>Move to trash</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EvaluationDetailPage;
