import { trainingStatusLabel } from '../../utils/trainingStatus';
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { livePalette, tint } from '@visin/frontend-core';
import { CheckCircle as SuccessIcon, Error as ErrorIcon, Schedule as PendingIcon } from '@mui/icons-material';
import { Training } from '../../types';

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 var(--live-ring); }
  70% { box-shadow: 0 0 0 6px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
`;

/** A dot that pulses: this run is training now. Where motion is reduced it is a steady dot. */
const LiveDot: React.FC<{ color: string }> = ({ color }) => (
  <Box
    aria-hidden
    data-testid="live-dot"
    sx={{
      width: 8,
      height: 8,
      m: '4px',
      borderRadius: '50%',
      bgcolor: color,
      '--live-ring': tint(color, 0.45),
      animation: `${pulse} 1.6s ease-out infinite`,
      '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
    }}
  />
);

export const StatusChip: React.FC<{ training: Pick<Training, 'status' | 'lastSeenAt' | 'metrics'> }> = ({ training }) => {
  const { status } = training;
  const theme = useTheme();

  let color = livePalette(theme).text.secondary;
  let bgcolor = livePalette(theme).action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  const epochs = training.metrics?.epochCount ?? 0;
  // A run in progress says how far it has got, which is what someone watching it wants to know.
  const label = status === 'running' && epochs > 0 ? `running · epoch ${epochs}` : trainingStatusLabel(training);

  switch (status) {
    case 'completed':
      color = livePalette(theme).success.main;
      bgcolor = tint(livePalette(theme).success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = livePalette(theme).info.main;
      bgcolor = tint(livePalette(theme).info.main, 0.1);
      icon = <LiveDot color={color} />;
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
