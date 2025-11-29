import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { BarChart, LineChart } from '@mui/x-charts';
import { Epoch, Comment } from '../types';
import ChartComments from './ChartComments';

interface TrainingTimeMetricsProps {
  epochs: Epoch[];
  trainingId?: string;
  comments?: Comment[];
  commentsLoading?: boolean;
  onCommentsRefetch?: () => void;
}

const TrainingTimeMetrics: React.FC<TrainingTimeMetricsProps> = ({ 
  epochs, 
  trainingId, 
  comments, 
  commentsLoading, 
  onCommentsRefetch 
}) => {
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
  
  // Calculate cumulative times
  const cumulativeTimes = epochTimes.reduce((acc: number[], time, index) => {
    const cumulative = (acc[index - 1] || 0) + time;
    acc.push(cumulative);
    return acc;
  }, []);

  const hasTimeData = epochTimes.some(t => t > 0);

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      {/* Epoch Time Charts */}
      {hasTimeData && (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {/* Per-Epoch Time Chart */}
          <Paper sx={{ p: 3, position: 'relative' }}>
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
            {trainingId && (
              <ChartComments 
                trainingId={trainingId} 
                section="time_per_epoch_chart" 
                comments={comments}
                commentsLoading={commentsLoading}
                onCommentsRefetch={onCommentsRefetch}
              />
            )}
          </Paper>

          {/* Cumulative Time Chart */}
          <Paper sx={{ p: 3, position: 'relative' }}>
            <Typography variant="h6" gutterBottom>
              Cumulative Training Time
            </Typography>
            <Box sx={{ width: '100%', height: 300 }}>
              <LineChart
                xAxis={[{ data: epochNumbers, label: 'Epoch', scaleType: 'linear' }]}
                series={[{
                  data: cumulativeTimes,
                  label: 'Cumulative Time',
                  color: '#ff9800',
                  showMark: false,
                  valueFormatter: (value) => formatTime(value as number)
                }]}
                margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              />
            </Box>
            {trainingId && (
              <ChartComments 
                trainingId={trainingId} 
                section="cumulative_time_chart" 
                comments={comments}
                commentsLoading={commentsLoading}
                onCommentsRefetch={onCommentsRefetch}
              />
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};

export default TrainingTimeMetrics;
