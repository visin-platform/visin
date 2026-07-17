import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { Loader } from '@visin/frontend-core';
import { JobAction, downloadExport, getJob, getJobStats, listJobs, transitionJob } from '../services/jobService';

const STATUS_COLORS: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  completed: 'info',
  archived: 'default'
};

const JobDetailPage: React.FC = () => {
  const { id: jobId = '' } = useParams();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: job, isLoading } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });
  const { data: stats } = useQuery({ queryKey: ['job-stats', jobId], queryFn: () => getJobStats(jobId) });
  // Admin controls appear when this job shows up in the caller's admin listing.
  const { data: adminJobs } = useQuery({ queryKey: ['jobs', 'admin'], queryFn: () => listJobs('admin') });
  const isAdmin = Boolean(adminJobs?.some((candidate) => candidate._id === jobId));

  const transition = useMutation({
    mutationFn: (action: JobAction) => transitionJob(jobId, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', jobId] }),
    onError: (err) => setActionError((err as Error).message)
  });

  if (isLoading || !job) {
    return <Loader message="Loading job..." />;
  }

  const progress = job.progress;
  const completion = progress && progress.tasks > 0 ? (progress.completed / progress.tasks) * 100 : 0;

  return (
    <Stack spacing={3}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 700, flexGrow: 1 }}>
            {job.name}
          </Typography>
          <Chip label={job.status} color={STATUS_COLORS[job.status]} size="small" />
          <Chip label={job.taskType} size="small" variant="outlined" />
          <Chip label={`K=${job.redundancy}`} size="small" variant="outlined" />
        </Stack>
        <Typography variant="body1" sx={{ mt: 1 }}>
          {job.question.prompt}
        </Typography>
        {job.description && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            {job.description}
          </Typography>
        )}

        {progress && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {progress.completed}/{progress.tasks} tasks complete · {progress.answers} answers · {progress.myAnswers}{' '}
              by me
            </Typography>
            <LinearProgress variant="determinate" value={completion} sx={{ mt: 1 }} />
          </Box>
        )}

        {actionError && (
          <Alert severity="error" onClose={() => setActionError(null)} sx={{ mt: 2 }}>
            {actionError}
          </Alert>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap' }}>
          {job.status === 'active' && (
            <Button component={Link} to={`/jobs/${jobId}/work`} variant="contained">
              Start labeling
            </Button>
          )}
          {isAdmin && job.status === 'draft' && (
            <Button variant="outlined" onClick={() => transition.mutate('activate')}>
              Activate
            </Button>
          )}
          {isAdmin && job.status === 'active' && (
            <Button variant="outlined" onClick={() => transition.mutate('pause')}>
              Pause
            </Button>
          )}
          {isAdmin && job.status === 'paused' && (
            <Button variant="outlined" onClick={() => transition.mutate('resume')}>
              Resume
            </Button>
          )}
          {isAdmin && job.status !== 'archived' && (
            <Button variant="text" color="warning" onClick={() => transition.mutate('archive')}>
              Archive
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="text" onClick={() => downloadExport(jobId, 'jsonl').catch((err) => setActionError(err.message))}>
                Export JSONL
              </Button>
              <Button variant="text" onClick={() => downloadExport(jobId, 'csv').catch((err) => setActionError(err.message))}>
                Export CSV
              </Button>
            </>
          )}
        </Stack>
      </Paper>

      {stats && (
        <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Progress
          </Typography>
          {job.redundancy > 1 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              Inter-rater agreement:{' '}
              {stats.agreement === null ? 'n/a (no overlapping answers yet)' : `${(stats.agreement * 100).toFixed(1)}%`}
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Per labeler
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Labeler</TableCell>
                <TableCell align="right">Answered</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stats.perUser.map((user) => (
                <TableRow key={user.userEmail}>
                  <TableCell>{user.userName || user.userEmail}</TableCell>
                  <TableCell align="right">{user.answered}</TableCell>
                </TableRow>
              ))}
              {stats.perUser.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} sx={{ color: 'text.secondary' }}>
                    No answers yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {stats.perStratum.length > 1 && (
            <>
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Per stratum
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Stratum</TableCell>
                    <TableCell align="right">Tasks</TableCell>
                    <TableCell align="right">Complete</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stats.perStratum.map((stratum) => (
                    <TableRow key={stratum.stratum}>
                      <TableCell>{stratum.stratum}</TableCell>
                      <TableCell align="right">{stratum.tasks}</TableCell>
                      <TableCell align="right">{stratum.completed}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Paper>
      )}
    </Stack>
  );
};

export default JobDetailPage;
