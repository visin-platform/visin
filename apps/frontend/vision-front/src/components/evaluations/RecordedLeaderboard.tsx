import React, { useState } from 'react';
import { Alert, Box, CircularProgress, Link, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useCompactLayout } from '@visin/frontend-core';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { evaluationService } from '../../services/evaluationService';
import type { RecordedLeaderboardQuery } from '../../types/evaluation';
import LeaderboardPagination from './LeaderboardPagination';
import { checkpointLabel, formatFixed } from './verdict';
import VerificationMark from './VerificationMark';
import { MobileListRow } from '../common/MobileList';

/** Recorded scores, including migrated tests; verification is a label rather than an entry requirement. */
const RecordedLeaderboard: React.FC = () => {
  const { user } = useAuth();
  const compact = useCompactLayout();
  const [verification, setVerification] = useState<NonNullable<RecordedLeaderboardQuery['verification']>>('all');
  const [metric, setMetric] = useState<string>();
  const [direction, setDirection] = useState<'max' | 'min'>();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useQuery({
    queryKey: ['recorded-leaderboard', user?.id, verification, metric, direction, page],
    queryFn: () => evaluationService.leaderboard({ verification, metric, direction, page })
  });
  return (
    <Box component="section" aria-labelledby="recorded-heading" sx={{ mb: 4 }}>
      <Typography id="recorded-heading" variant="h6" gutterBottom>Recorded results</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Latest completed result per model or run. Compare results using the same data and metric. Verification can come from a manager or an automated job.</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
        <TextField select size="small" label="Verification" value={verification} onChange={event => { setVerification(event.target.value as typeof verification); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="all">All</MenuItem><MenuItem value="verified">Verified</MenuItem><MenuItem value="unverified">Not verified</MenuItem>
        </TextField>
        {!!data?.metrics.length && <>
          <TextField select size="small" label="Metric" value={metric ?? data.metric ?? ''} onChange={event => { setMetric(event.target.value); setDirection(undefined); setPage(1); }} sx={{ minWidth: 200, maxWidth: '100%' }}>
            {data.metrics.map(path => <MenuItem key={path} value={path}>{path}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Best score" value={direction ?? data.direction} onChange={event => { setDirection(event.target.value as 'max' | 'min'); setPage(1); }} sx={{ minWidth: 150 }}>
            <MenuItem value="max">Highest</MenuItem><MenuItem value="min">Lowest</MenuItem>
          </TextField>
        </>}
      </Box>
      {isLoading && <CircularProgress aria-label="Loading recorded results" />}
      {error && <Alert severity="error">{error instanceof Error ? error.message : 'Failed to load recorded results'}</Alert>}
      {data && (data.entries.length === 0 ? <Alert severity="info">No recorded results match these filters.</Alert> : compact ?
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          {data.entries.map(entry => <MobileListRow
            key={entry.evaluationId}
            to={`/evaluations/${entry.evaluationId}`}
            title={`${entry.rank}. ${entry.checkpoint ? checkpointLabel(entry.checkpoint) : entry.run?.name ?? 'Evaluation'}`}
            meta={[entry.project.name, entry.dataset, entry.epoch !== undefined ? `Epoch ${entry.epoch}` : undefined].filter(Boolean).join(' · ')}
            figures={[
              { label: data.metric ?? 'Score', value: formatFixed(entry.value) },
              { label: 'Verification', value: <VerificationMark verified={entry.verified} /> }
            ]}
          />)}
        </Paper> :
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <Table size="small" aria-label="Recorded result leaderboard">
            <TableHead><TableRow><TableCell>Rank</TableCell><TableCell>Model / run</TableCell><TableCell>Project / data</TableCell><TableCell align="right">{data.metric}</TableCell><TableCell>Verification</TableCell></TableRow></TableHead>
            <TableBody>{data.entries.map(entry => <TableRow key={entry.evaluationId}>
              <TableCell>{entry.rank}</TableCell>
              <TableCell><Link component={RouterLink} to={`/evaluations/${entry.evaluationId}`}>{entry.checkpoint ? checkpointLabel(entry.checkpoint) : entry.run?.name ?? 'Evaluation'}</Link>{entry.epoch !== undefined && <Typography variant="caption" sx={{ display: 'block' }}>Epoch {entry.epoch}</Typography>}</TableCell>
              <TableCell>{entry.project.name}{entry.dataset && <Typography variant="caption" sx={{ display: 'block' }}>{entry.dataset}</Typography>}</TableCell>
              <TableCell align="right">{formatFixed(entry.value)}</TableCell>
              <TableCell><VerificationMark verified={entry.verified} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>)}
      {data && <LeaderboardPagination pagination={data.pagination} onChange={setPage} label="Recorded result pages" />}
    </Box>
  );
};

export default RecordedLeaderboard;
