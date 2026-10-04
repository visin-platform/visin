import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Button, Link, MenuItem, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import VerificationMark from './VerificationMark';
import { ArrowForward } from '@mui/icons-material';
import { checkpointName, fetchRecordedLeaderboard, formatScore, type Verification } from '../leaderboard';

/** The default home-page preview needs neither a selected suite nor publication of migrated run results. */
export default function RecordedLeaderboardPreview({ apiUrl, appUrl, phone }: { apiUrl: string; appUrl?: string; phone: boolean }) {
  const [verification, setVerification] = useState<Verification>('all');
  const { data, isPending, isError } = useQuery({
    queryKey: ['recorded-leaderboard-preview', apiUrl, verification],
    queryFn: ({ signal }) => fetchRecordedLeaderboard(apiUrl, verification, signal)
  });
  const root = appUrl?.replace(/\/+$/, '');
  const name = (entry: NonNullable<typeof data>['entries'][number]) => entry.checkpoint ? checkpointName(entry.checkpoint) : entry.run?.name ?? 'Evaluation';
  return <>
    <Typography color="text.secondary" sx={{ mb: 2 }}>Recorded evaluation results, including migrated runs. Verification can come from a manager or an automated job.</Typography>
    <TextField select size="small" label="Verification" value={verification} onChange={event => setVerification(event.target.value as Verification)} sx={{ minWidth: 180, mb: 2 }}>
      <MenuItem value="all">All</MenuItem><MenuItem value="verified">Verified</MenuItem><MenuItem value="unverified">Not verified</MenuItem>
    </TextField>
    {isPending && <Typography color="text.secondary">Loading the leaderboard…</Typography>}
    {isError && <Typography color="text.secondary">The leaderboard is not available right now</Typography>}
    {data && <>
      {data.entries.length === 0 ? <Typography color="text.secondary">No recorded results match this filter.</Typography> : <>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{data.direction === 'max' ? 'Higher' : 'Lower'} {data.metric ?? 'score'} is better. Latest completed result per model or run; compare scores using the same data and metric.</Typography>
        {phone ? <Paper variant="outlined" component="ol" aria-label="Recorded result leaderboard" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {data.entries.map((entry, index) => <Box component="li" key={entry.evaluationId} sx={{ p: 2, borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}>
            <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{entry.rank}. {root ? <Link href={`${root}/evaluations/${entry.evaluationId}`}>{name(entry)}</Link> : name(entry)}</Typography>
            <Typography variant="body2" color="text.secondary">{entry.project.name}{entry.dataset ? ` · ${entry.dataset}` : ''}{entry.epoch !== undefined ? ` · Epoch ${entry.epoch}` : ''}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}><Typography sx={{ fontWeight: 700 }}>{formatScore(entry.value)}</Typography><VerificationMark verified={entry.verified} /></Box>
          </Box>)}
        </Paper> : <TableContainer component={Paper} variant="outlined"><Table size="small" aria-label="Recorded result leaderboard">
          <TableHead><TableRow><TableCell>Rank</TableCell><TableCell>Model / run</TableCell><TableCell>Project / data</TableCell><TableCell align="right">{data.metric ?? 'Score'}</TableCell><TableCell>Verification</TableCell></TableRow></TableHead>
          <TableBody>{data.entries.map(entry => <TableRow key={entry.evaluationId}>
            <TableCell>{entry.rank}</TableCell><TableCell>{root ? <Link href={`${root}/evaluations/${entry.evaluationId}`}>{name(entry)}</Link> : name(entry)}{entry.epoch !== undefined && <Typography variant="caption"> · Epoch {entry.epoch}</Typography>}</TableCell>
            <TableCell>{entry.project.name}{entry.dataset && <Typography variant="caption" sx={{ display: 'block' }}>{entry.dataset}</Typography>}</TableCell><TableCell align="right"><strong>{formatScore(entry.value)}</strong></TableCell>
            <TableCell><VerificationMark verified={entry.verified} /></TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>}
      </>}
    </>}
    {root && <Button href={`${root}/leaderboards`} endIcon={<ArrowForward />} sx={{ mt: 1.5 }}>All leaderboards</Button>}
  </>;
}
