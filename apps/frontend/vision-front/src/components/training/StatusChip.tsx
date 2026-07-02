import React from 'react';
import { Box, useTheme, alpha } from '@mui/material';
import {
  PlayArrow as RunIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Schedule as PendingIcon
} from '@mui/icons-material';
import { Training } from '../../types';

interface StatusChipProps {
  status: Training['status'];
}

const StatusChip: React.FC<StatusChipProps> = ({ status }) => {
  const theme = useTheme();
  
  let color = theme.palette.text.secondary;
  let bgcolor = theme.palette.action.hover;
  let icon = <PendingIcon style={{ fontSize: 16 }} />;
  const label = status;

  switch (status) {
    case 'completed':
      color = theme.palette.success.main;
      bgcolor = alpha(theme.palette.success.main, 0.1);
      icon = <SuccessIcon style={{ fontSize: 16 }} />;
      break;
    case 'running':
      color = theme.palette.info.main;
      bgcolor = alpha(theme.palette.info.main, 0.1);
      icon = <RunIcon style={{ fontSize: 16 }} />;
      break;
    case 'failed':
      color = theme.palette.error.main;
      bgcolor = alpha(theme.palette.error.main, 0.1);
      icon = <ErrorIcon style={{ fontSize: 16 }} />;
      break;
    case 'pending':
      color = theme.palette.warning.main;
      bgcolor = alpha(theme.palette.warning.main, 0.1);
      icon = <PendingIcon style={{ fontSize: 16 }} />;
      break;
  }

  return (
    <Box 
      sx={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 2,
        bgcolor: bgcolor,
        color: color,
        fontSize: '0.875rem',
        fontWeight: 600,
        textTransform: 'capitalize'
      }}
    >
      {icon}
      {label}
    </Box>
  );
};

export default StatusChip;
