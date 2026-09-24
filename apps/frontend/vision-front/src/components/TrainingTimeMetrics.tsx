import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { BarChart } from '@mui/x-charts';
import { useChartColors } from '@visin/frontend-core';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface TrainingTimeMetricsProps {
  epochs: Epoch[];
}

const TrainingTimeMetrics: React.FC<TrainingTimeMetricsProps> = ({ 
  epochs
}) => {
  const { isMobile } = useMobileChartTooltip();
  const colors = useChartColors();
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
  // An epoch with no recorded time has no bar, rather than a bar of zero.
  const epochTimes = epochs.map(e => e.epoch_time ?? null);

  const hasTimeData = epochTimes.some(t => t !== null && t > 0);

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
                  color: colors.slot(0),
                  valueFormatter: (value) => (value === null ? 'Not recorded' : formatTime(value))
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
