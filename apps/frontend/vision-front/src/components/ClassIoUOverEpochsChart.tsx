import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch, Comment } from '../types';
import ChartComments from './ChartComments';

interface ClassIoUOverEpochsChartProps {
  epochs: Epoch[];
  trainingId: string;
  comments?: Comment[];
  commentsLoading?: boolean;
  onCommentsRefetch?: () => void;
}

const ClassIoUOverEpochsChart: React.FC<ClassIoUOverEpochsChartProps> = ({ 
  epochs, 
  trainingId, 
  comments, 
  commentsLoading, 
  onCommentsRefetch 
}) => {
  if (epochs.length === 0 || !epochs.some(epoch => epoch.results?.val_standard)) {
    return null;
  }

  const epochNumbers = epochs.map(e => e.epoch);

  return (
    <Paper sx={{ p: 3, position: 'relative' }}>
      <Typography variant="h6" gutterBottom>Standard IoU Over Epochs (Validation Data)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Per-class IoU values from the standard evaluation protocol over training epochs.
        Shows how each class's segmentation performance evolves during training using the official evaluation method.
      </Typography>
      <Box sx={{ width: '100%', height: 350 }}>
        <LineChart
          xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
          series={[
            {
              data: epochs.map(epoch => epoch.results?.val_standard?.vehicle?.iou ?? null),
              label: 'Vehicle IoU',
              color: '#1976d2',
              showMark: false
            },
            {
              data: epochs.map(epoch => epoch.results?.val_standard?.sign?.iou ?? null),
              label: 'Sign IoU',
              color: '#d32f2f',
              showMark: false
            },
            {
              data: epochs.map(epoch => epoch.results?.val_standard?.['cyclist + pedestrian']?.iou ?? null),
              label: 'Cyclist + Pedestrian IoU',
              color: '#f57c00',
              showMark: false
            },
            {
              data: epochs.map(epoch => epoch.results?.val_standard?.human?.iou ?? null),
              label: 'Human IoU',
              color: '#388e3c',
              showMark: false
            }
          ]}
          margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
        />
      </Box>
      <ChartComments 
        trainingId={trainingId} 
        section="class_iou_standard_chart" 
        comments={comments}
        commentsLoading={commentsLoading}
        onCommentsRefetch={onCommentsRefetch}
      />
    </Paper>
  );
};

export default ClassIoUOverEpochsChart;