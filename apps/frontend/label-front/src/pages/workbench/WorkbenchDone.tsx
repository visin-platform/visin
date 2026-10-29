import React from 'react';
import { Link } from 'react-router-dom';
import { Box, Button, Stack, Typography } from '@mui/material';
import { CheckCircleOutlined, NavigateBefore } from '@mui/icons-material';

interface WorkbenchDoneProps {
  jobId: string;
  /** Whether the job has any frames at all. */
  hasFrames: boolean;
  /** Frames this annotator finished in this session. */
  sessionDone: number;
  onReview: () => void;
}

/** What the editor shows when the queue has nothing left for this annotator. */
const WorkbenchDone: React.FC<WorkbenchDoneProps> = ({ jobId, hasFrames, sessionDone, onReview }) => (
  <Box sx={{ textAlign: 'center', py: 8 }}>
    <CheckCircleOutlined sx={{ fontSize: 56, color: 'success.main' }} />
    <Typography variant="h5" sx={{ fontWeight: 700, mt: 1 }}>
      {hasFrames ? 'All done' : 'No frames yet'}
    </Typography>
    <Typography sx={{ color: 'text.secondary', mb: 3 }}>
      {hasFrames
        ? `No frames left for you in this job. You finished ${sessionDone} this session.`
        : 'This job has no frames materialized yet.'}
    </Typography>
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
      {hasFrames && (
        <Button variant="outlined" startIcon={<NavigateBefore />} onClick={onReview}>
          Review labeled frames
        </Button>
      )}
      <Button component={Link} to={`/jobs/${jobId}`} variant="contained">
        Back to job
      </Button>
    </Stack>
  </Box>
);

export default WorkbenchDone;
