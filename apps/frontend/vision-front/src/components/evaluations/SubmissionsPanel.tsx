import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { evaluationService, suiteService } from '../../services/evaluationService';
import type { Submission, SubmissionPolicy, Suite } from '../../types/evaluation';
import { formatDate } from '../../utils';
import { SUBMISSION_POLICIES } from './submissionPolicies';
import { checkpointLabel, formatFixed } from './verdict';

const outcome = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

interface Props {
  suite: Suite;
}

/**
 * For the people who run a suite: who may publish to its public leaderboard, the results other projects submitted that
 * wait for approval, and what they hid. A viewer who is not a manager of the suite's project is refused by the API and
 * sees nothing here, so the panel needs no permission of its own.
 */
const SubmissionsPanel: React.FC<Props> = ({ suite }) => {
  const queryClient = useQueryClient();
  const [hiding, setHiding] = useState<Submission>();
  const [reason, setReason] = useState('');
  const key = ['suite-submissions', suite.slug, suite.version];
  const { data } = useQuery({ queryKey: key, queryFn: () => suiteService.submissions(suite.slug, String(suite.version)), retry: false });

  const refreshed = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['suite', suite.slug, String(suite.version)] });
    queryClient.invalidateQueries({ queryKey: ['public-leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['public-leaderboards'] });
    queryClient.invalidateQueries({ queryKey: ['recorded-leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['evaluation'] });
  };
  const policy = useMutation({ mutationFn: (submissions: SubmissionPolicy) => suiteService.update(suite.slug, String(suite.version), { submissions }), onSuccess: refreshed });
  const approve = useMutation({ mutationFn: (id: string) => evaluationService.approve(id), onSuccess: refreshed });
  const unhide = useMutation({ mutationFn: (id: string) => evaluationService.unhide(id), onSuccess: refreshed });
  const hide = useMutation({
    mutationFn: ({ id, why }: { id: string; why: string }) => evaluationService.hide(id, why),
    onSuccess: () => {
      setHiding(undefined);
      setReason('');
      refreshed();
    }
  });

  if (!data) return null;
  const current = SUBMISSION_POLICIES.find(item => item.value === (data.suite.submissions ?? suite.submissions)) ?? SUBMISSION_POLICIES[0];
  const failure = [policy, approve, unhide].find(mutation => mutation.isError);

  const rows = (items: Submission[], actions: (item: Submission) => React.ReactNode, label: string) => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <Table size="small" aria-label={label}>
        <TableHead>
          <TableRow>
            <TableCell>Checkpoint</TableCell>
            <TableCell>From</TableCell>
            <TableCell align="right">{items[0]?.headline?.key ?? 'Score'}</TableCell>
            <TableCell>{label === 'Hidden results' ? 'Why' : 'Published'}</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.evaluationId}>
              <TableCell>{checkpointLabel(item.checkpoint)}</TableCell>
              <TableCell>{item.project?.name ?? '-'}</TableCell>
              <TableCell align="right">{item.headline ? formatFixed(item.headline.value) : '-'}</TableCell>
              <TableCell>{item.hidden ? item.hidden.reason ?? 'No reason given' : item.publishedAt ? formatDate(item.publishedAt) : '-'}</TableCell>
              <TableCell align="right">{actions(item)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <section aria-labelledby="submissions-heading">
      <Typography id="submissions-heading" variant="h6" gutterBottom>Who can publish here</Typography>
      <Box sx={{ display: 'grid', gap: 2 }}>
        <Box>
          <TextField
            select
            size="small"
            label="Publishing to this suite"
            value={current.value}
            onChange={event => policy.mutate(event.target.value as SubmissionPolicy)}
            disabled={policy.isPending}
            sx={{ minWidth: 240 }}
          >
            {SUBMISSION_POLICIES.map(item => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {current.summary} Changing this does not touch what is already published.
          </Typography>
        </Box>
        {failure && <Alert severity="error">{outcome(failure.error, 'Could not make that change')}</Alert>}
        {data.pending.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Not verified</Typography>
            {rows(
              data.pending,
              item => (
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button size="small" onClick={() => approve.mutate(item.evaluationId)} disabled={approve.isPending}>Verify</Button>
                  <Button size="small" color="error" onClick={() => setHiding(item)}>Hide</Button>
                </Box>
              ),
              'Results awaiting verification'
            )}
          </Box>
        )}
        {data.hidden.length > 0 && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>Hidden from the leaderboard</Typography>
            {rows(
              data.hidden,
              item => <Button size="small" onClick={() => unhide.mutate(item.evaluationId)} disabled={unhide.isPending}>Show again</Button>,
              'Hidden results'
            )}
          </Box>
        )}
      </Box>

      <Dialog open={Boolean(hiding)} onClose={() => setHiding(undefined)} fullWidth maxWidth="sm">
        <DialogTitle>Hide this result from the leaderboard</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {hiding ? `${checkpointLabel(hiding.checkpoint)}, from ${hiding.project?.name ?? 'another project'}. ` : ''}
            Its project is told it was hidden and why, and cannot publish it again until you show it.
          </Typography>
          <TextField label="Reason" value={reason} onChange={event => setReason(event.target.value)} fullWidth multiline minRows={2} required slotProps={{ htmlInput: { maxLength: 500 } }} />
          {hide.isError && <Alert severity="error" sx={{ mt: 2 }}>{outcome(hide.error, 'Could not hide the result')}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHiding(undefined)}>Cancel</Button>
          <Button color="error" variant="contained" disabled={!reason.trim() || hide.isPending} onClick={() => hiding && hide.mutate({ id: hiding.evaluationId, why: reason.trim() })}>
            Hide
          </Button>
        </DialogActions>
      </Dialog>
    </section>
  );
};

export default SubmissionsPanel;
