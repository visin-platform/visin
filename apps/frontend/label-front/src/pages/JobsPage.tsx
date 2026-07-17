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
  Stack,
  Typography
} from '@mui/material';
import { AssignmentOutlined } from '@mui/icons-material';
import { Loader } from '@visin/frontend-core';
import { listJobs } from '../services/jobService';

const JobsPage: React.FC = () => {
  const { data: jobs, isLoading, error } = useQuery({ queryKey: ['jobs', 'worker'], queryFn: () => listJobs('worker') });

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
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
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
