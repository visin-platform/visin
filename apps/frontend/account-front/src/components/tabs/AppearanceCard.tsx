import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { ColorModeSetting } from '@visin/frontend-core';

/**
 * Light, dark, or whatever the device is set to. The same setting as the
 * Appearance item in the account menu, here where settings are looked for.
 */
const AppearanceCard: React.FC = () => (
  <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 }, borderRadius: '16px' }}>
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
        Appearance
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        Kept per device, so a laptop can stay dark while a desk monitor stays light. Auto follows the device.
      </Typography>
    </Box>
    <Box sx={{ maxWidth: 420 }}>
      <ColorModeSetting label={null} />
    </Box>
  </Paper>
);

export default AppearanceCard;
