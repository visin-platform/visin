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
  Typography,
  useTheme
} from '@mui/material';
import { Add, AssignmentOutlined } from '@mui/icons-material';
import { EmptyState, Loader, PageHeader, Panel, RowIcon } from '@visin/frontend-core';
import { useAuth } from '../contexts/AuthContext';
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
        sx={{ height: 8 }}
      />
    </Box>
  );
};

const JobsPage: React.FC = () => {
  const theme = useTheme();
  const { isAuthenticated } = useAuth();
  const { data: jobs, isLoading, error } = useQuery({ queryKey: ['jobs', 'worker'], queryFn: () => listJobs('worker') });
  // "My groups" is a question only a signed-in caller can ask; asking it
  // anonymously would just be a 401 rendered as a broken page.
  const { data: groups } = useQuery({ queryKey: ['my-groups'], queryFn: getMyGroups, enabled: isAuthenticated });

  // Creating a job needs a group you administer; without one the wizard's group
  // picker would be empty, so offer the button only where it can be finished.
  const canCreate = (groups || []).some((group) => group.role === 'owner' || group.role === 'admin');
  const newJob = canCreate ? { label: 'New job', icon: <Add />, to: '/jobs/new' } : undefined;

  if (isLoading) {
    return <Loader message="Loading jobs..." />;
  }
  if (error) {
    return <Alert severity="error">{(error as Error).message}</Alert>;
  }

  if (!jobs || jobs.length === 0) {
    return (
      <>
        <PageHeader primaryAction={newJob} />
        <Panel>
          <EmptyState
            icon={<AssignmentOutlined />}
            title="No labeling jobs yet"
            description={
              isAuthenticated ? 'Active jobs shared with your groups will appear here.' : 'Active jobs will appear here.'
            }
          />
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageHeader
        subtitle={
          <>
            {isAuthenticated ? 'Active jobs in your groups.' : 'Active labeling jobs.'} Progress counts frames finished
            by everyone, not just you.
          </>
        }
        primaryAction={newJob}
      />

      <Stack spacing={2}>
        {jobs.map((job) => (
          <Card key={job._id}>
            <CardContent sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <RowIcon color={theme.palette.primary.main}>
                  <AssignmentOutlined fontSize="small" />
                </RowIcon>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="h6" sx={{ fontSize: '1.05rem', lineHeight: 1.3 }}>
                    {job.name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {job.question.prompt}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                <Chip size="small" label={job.taskType === 'mask_toggle' ? 'Mask verification' : 'Single choice'} />
                <Chip size="small" label={`${job.tasksCount.toLocaleString()} tasks`} variant="outlined" />
              </Stack>
              <JobProgressBar job={job} />
            </CardContent>
            <CardActions sx={{ px: 2, pb: 2, pt: 1, gap: 1 }}>
              <Button component={Link} to={`/jobs/${job._id}/work`} variant="contained">
                {isAuthenticated ? 'Start labeling' : 'View frames'}
              </Button>
              <Button component={Link} to={`/jobs/${job._id}`}>
                Details
              </Button>
            </CardActions>
          </Card>
        ))}
      </Stack>
    </>
  );
};

export default JobsPage;
