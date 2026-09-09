import React from 'react';
import {
  Box,
  Paper,
  Typography
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';
import ClassMetricChart from './ClassMetricChart';

interface TrainingChartsSectionProps {
  epochs: Epoch[];
}

export const TrainingChartsSection: React.FC<TrainingChartsSectionProps> = ({ epochs }) => {
  // Extract metrics data for charts
  const epochNumbers = epochs.map(e => e.epoch);
  const trainLoss = epochs.map(e => e.results?.train?.loss ?? null);
  const valLoss = epochs.map(e => e.results?.val?.loss ?? null);
  const trainMeanIoU = epochs.map(e => e.results?.train?.mean_iou ?? null);
  const valMeanIoU = epochs.map(e => e.results?.val?.mean_iou ?? null);
  const learningRates = epochs.map(e => e.learning_rate ?? null);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3
      }}>
      {/* Loss Chart */}
      {epochs.length > 0 && trainLoss.some(v => v !== undefined) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Loss Over Epochs
          </Typography>
          <Box sx={{ width: '100%', height: { xs: 250, sm: 300, md: 350 } }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                { data: trainLoss, label: 'Train Loss', color: '#424242' },
                { data: valLoss, label: 'Val Loss', color: '#757575' }
              ]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' },
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Mean IoU Chart */}
      {epochs.length > 0 && trainMeanIoU.some(v => v !== undefined) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Mean IoU Over Epochs
          </Typography>
          <Box sx={{ width: '100%', height: { xs: 250, sm: 300, md: 350 } }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                { data: trainMeanIoU, label: 'Train mIoU', color: '#212121' },
                { data: valMeanIoU, label: 'Val mIoU', color: '#616161' }
              ]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' },
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Learning Rate Chart */}
      {epochs.length > 0 && learningRates.some(v => v !== null) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Learning Rate Schedule (×10⁶)
          </Typography>
          <Box sx={{ width: '100%', height: { xs: 250, sm: 300, md: 350 } }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                {
                  data: learningRates.map(lr => lr ? lr * 1000000 : null),
                  label: 'Learning Rate × 10⁶',
                  color: '#424242'
                }
              ]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' },
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Class IoU Over Time Chart */}
      {epochs.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Class IoU Over Time
          </Typography>
          {/* Series are discovered from the epochs, so this follows whatever
              classes the run reported instead of four hard-coded ones. */}
          <ClassMetricChart epochs={epochs} metric="iou" />
        </Box>
      )}
    </Box>
  );
};

export default TrainingChartsSection;
