import React from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import { getGlobalConfig } from '../config/ConfigProvider';

/**
 * The in-app image labeling tool moved to the dedicated labeling platform
 * (label-front). This page keeps the old /image-labeling URL working — old
 * bookmarks and deep links land here and get sent onward.
 */
const LabelingRedirectPage: React.FC = () => {
  const labelFrontUrl = getGlobalConfig().LABEL_FRONT_URL || 'https://label.visin.eu';

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}>
      <Paper variant="outlined" sx={{ p: 5, maxWidth: 520, textAlign: 'center', borderRadius: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          Labeling has moved
        </Typography>
        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 3 }}>
          Image labeling is now a dedicated app with jobs, teams, and mask verification. Existing good/bad labels are
          preserved.
        </Typography>
        <Button variant="contained" endIcon={<OpenInNew />} href={labelFrontUrl}>
          Open Labeling
        </Button>
      </Paper>
    </Box>
  );
};

export default LabelingRedirectPage;
