import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { AssignmentOutlined } from '@mui/icons-material';

const JobsPage: React.FC = () => {
  return (
    <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <AssignmentOutlined sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          No labeling jobs yet
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Jobs shared with your groups will appear here.
        </Typography>
      </Box>
    </Paper>
  );
};

export default JobsPage;
