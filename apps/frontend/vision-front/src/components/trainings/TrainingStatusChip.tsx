import { trainingStatusLabel } from '../../utils/trainingStatus';
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { livePalette, tint } from '@visin/frontend-core';
import { PlayArrow as RunIcon, CheckCircle as SuccessIcon, Error as ErrorIcon, Schedule as PendingIcon } from '@mui/icons-material';
import { Training } from '../../types';

export const StatusChip: React.FC<{ training: Training }> = ({ training }) => {
  const { status } = training;
  const theme = useTheme();

  let color = livePalette(theme).text.secondary;
  let bgcolor = livePalette(theme).action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  const label = trainingStatusLabel(training);

  switch (status) {
    case 'completed':
      color = livePalette(theme).success.main;
      bgcolor = tint(livePalette(theme).success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = livePalette(theme).info.main;
      bgcolor = tint(livePalette(theme).info.main, 0.1);
      icon = <RunIcon style={{ fontSize: 16 }} />;
      break;
    case 'failed':
      color = livePalette(theme).error.main;
      bgcolor = tint(livePalette(theme).error.main, 0.1);
      icon = <ErrorIcon style={{ fontSize: 16 }} />;
      break;
    case 'stalled':
    case 'pending':
      color = livePalette(theme).warning.main;
      bgcolor = tint(livePalette(theme).warning.main, 0.1);
      icon = <PendingIcon style={{ fontSize: 16 }} />;
      break;
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        borderRadius: 1,
        bgcolor: bgcolor,
        color: color,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize'
      }}
    >
      {icon}
      {label}
    </Box>
  );
};
