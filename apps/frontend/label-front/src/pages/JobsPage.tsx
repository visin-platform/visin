import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { AssignmentOutlined } from '@mui/icons-material';
import { Loader } from '@visin/frontend-core';
import { getMyGroups, listJobs } from '../services/jobService';
import { LabelJob } from '../types';

/**
 * How far a job has got, and how much of it is this labeler's own doing.
 *
 * "Frames done" counts tasks that reached the job's redundancy K, not answers:
 * with K=2 a frame answered once is still waiting for its second opinion, and
 * counting it as done would show a job at 100% with half its labels missing.
 */
const JobProgressBar: React.FC<{ job: LabelJob }> = ({ job }) => {
  const progress = job.progress;
  if (!progress || progress.tasks === 0) {
    return null;
  }
  const percent = (progress.completed / progress.tasks) * 100;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {progress.completed.toLocaleString()} / {progress.tasks.toLocaleString()} frames done
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {percent.toFixed(0)}%
          {job.redundancy > 1 && <> · {progress.answers.toLocaleString()} labels collected</>}
          {progress.myAnswers > 0 && <> · you labeled {progress.myAnswers.toLocaleString()}</>}
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={percent}
        color={percent >= 100 ? 'success' : 'primary'}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
};

const JobsPage: React.FC = () => {
  const { data: jobs, isLoading, error } = useQuery({ queryKey: ['jobs', 'worker'], queryFn: () => listJobs('worker') });
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups });

  // Creating a job needs a group you administer; without one the wizard's group
  // picker would be empty, so offer the button only where it can be finished.
  const canCreate = (groups || []).some((group) => group.role === 'owner' || group.role === 'admin');
  const newJobButton = (
    <Button component={Link} to="/jobs/new" variant="contained">
      New job
    </Button>
  );

  if (isLoading) {
    return <Loader message="Loading jobs..." />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  if (!jobs || jobs.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <AssignmentOutlined sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          No labeling jobs yet
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Active jobs shared with your groups will appear here.
        </Typography>
        {canCreate && <Box sx={{ mt: 2 }}>{newJobButton}</Box>}
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          Active jobs in your groups. Progress counts frames finished by everyone, not just you.
        </Typography>
        {canCreate && newJobButton}
      </Stack>

      {jobs.map((job) => (
        <Card key={job._id} variant="outlined" sx={{ borderRadius: 3 }}>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>
                {job.name}
              </Typography>
              <Chip size="small" label={job.taskType === 'mask_toggle' ? 'mask verification' : 'single choice'} />
              <Chip size="small" label={`${job.tasksCount} tasks`} variant="outlined" />
            </Stack>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {job.question.prompt}
            </Typography>
            <JobProgressBar job={job} />
          </CardContent>
          <CardActions>
            <Button component={Link} to={`/jobs/${job._id}/work`} variant="contained" size="small">
              Start labeling
            </Button>
            <Button component={Link} to={`/jobs/${job._id}`} size="small">
              Details
            </Button>
          </CardActions>
        </Card>
      ))}
    </Stack>
  );
};

export default JobsPage;
