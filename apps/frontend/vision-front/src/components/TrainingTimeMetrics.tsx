import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { BarChart } from '@mui/x-charts';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface TrainingTimeMetricsProps {
  epochs: Epoch[];
}

const TrainingTimeMetrics: React.FC<TrainingTimeMetricsProps> = ({ 
  epochs
}) => {
  const { isMobile } = useMobileChartTooltip();
  if (epochs.length === 0) {
    return null;
  }

  // Format time duration
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
    return `${(seconds / 86400).toFixed(1)}d`;
  };

  // Get per-epoch times and cumulative times
  const epochNumbers = epochs.map(e => e.epoch);
  const epochTimes = epochs.map(e => e.epoch_time || 0);

  const hasTimeData = epochTimes.some(t => t > 0);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3
      }}>
      {/* Epoch Time Charts */}
      {hasTimeData && (
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, 
          gap: 3 
        }}>
          {/* Per-Epoch Time Chart */}
          <Paper sx={{ 
            p: 3, 
            position: 'relative',
            ...(isMobile && {
              '& .MuiTooltip-root': {
                '& .MuiTooltip-tooltip': {
                  marginTop: '-40px !important'
                }
              }
            })
          }}>
            <Typography variant="h6" gutterBottom>
              Time Spent Per Epoch
            </Typography>
            <Box sx={{ width: '100%', height: 300 }}>
              <BarChart
                xAxis={[{ data: epochNumbers, label: 'Epoch', scaleType: 'band' }]}
                series={[{
                  data: epochTimes,
                  label: 'Time per Epoch',
                  color: '#1976d2',
                  valueFormatter: (value) => formatTime(value as number)
                }]}
                margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              />
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default TrainingTimeMetrics;
