import React from 'react';
import {
  Box,
  Paper,
  Typography
} from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

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
    <Box display="flex" flexDirection="column" gap={3}>
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
                  direction: 'row',
                  position: { vertical: 'top', horizontal: 'middle' },
                  padding: 0,
                  itemMarkWidth: 10,
                  itemMarkHeight: 2,
                  markGap: 5,
                  itemGap: 15,
                  labelStyle: {
                    fontSize: 12
                  }
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
                  direction: 'row',
                  position: { vertical: 'top', horizontal: 'middle' },
                  padding: 0,
                  itemMarkWidth: 10,
                  itemMarkHeight: 2,
                  markGap: 5,
                  itemGap: 15,
                  labelStyle: {
                    fontSize: 12
                  }
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
                  direction: 'row',
                  position: { vertical: 'top', horizontal: 'middle' },
                  padding: 0,
                  itemMarkWidth: 10,
                  itemMarkHeight: 2,
                  markGap: 5,
                  itemGap: 15,
                  labelStyle: {
                    fontSize: 12
                  }
                }
              }}
            />
          </Box>
        </Paper>
      )}

      {/* Class IoU Over Time Chart */}
      {epochs.length > 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Class IoU Over Time
          </Typography>
          <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                {
                  data: epochs.map(epoch => (epoch.results?.val?.vehicle as any)?.iou || 0),
                  label: 'Vehicle (Val)',
                  color: '#e57373'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.train?.vehicle as any)?.iou || 0),
                  label: 'Vehicle (Train)',
                  color: '#ffcdd2'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.val?.sign as any)?.iou || 0),
                  label: 'Sign (Val)',
                  color: '#81c784'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.train?.sign as any)?.iou || 0),
                  label: 'Sign (Train)',
                  color: '#c8e6c9'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.val?.cyclist as any)?.iou || 0),
                  label: 'Cyclist (Val)',
                  color: '#64b5f6'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.train?.cyclist as any)?.iou || 0),
                  label: 'Cyclist (Train)',
                  color: '#bbdefb'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.val?.pedestrian as any)?.iou || 0),
                  label: 'Pedestrian (Val)',
                  color: '#ffb74d'
                },
                {
                  data: epochs.map(epoch => (epoch.results?.train?.pedestrian as any)?.iou || 0),
                  label: 'Pedestrian (Train)',
                  color: '#ffe0b2'
                }
              ]}
              margin={{ top: 10, bottom: 60, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'row',
                  position: { vertical: 'top', horizontal: 'middle' },
                  padding: 0,
                  itemMarkWidth: 10,
                  itemMarkHeight: 2,
                  markGap: 5,
                  itemGap: 10,
                  labelStyle: {
                    fontSize: 11
                  }
                }
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default TrainingChartsSection;
