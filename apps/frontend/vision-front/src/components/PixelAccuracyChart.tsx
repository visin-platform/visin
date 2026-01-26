import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface PixelAccuracyChartProps {
  epochs: Epoch[];
}

const PixelAccuracyChart: React.FC<PixelAccuracyChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_pixel_accuracy = sortedEpochs.map(e => e.results?.train?.pixel_accuracy ?? 0);
    const val_pixel_accuracy = sortedEpochs.map(e => e.results?.val?.pixel_accuracy ?? 0);

    return {
      epochs: epochs_data,
      train_pixel_accuracy,
      val_pixel_accuracy
    };
  }, [epochs]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation Pixel Accuracy
      </Typography>
      {chartData.train_pixel_accuracy.some(v => v > 0) || chartData.val_pixel_accuracy.some(v => v > 0) ? (
        <Box sx={{
          ...(isMobile && {
            '& .MuiTooltip-root': {
              '& .MuiTooltip-tooltip': {
                marginTop: '-40px !important'
              }
            }
          })
        }}>
          <LineChart
            xAxis={[{
              data: chartData.epochs,
              label: 'Epoch'
            }]}
            series={[
              {
                data: chartData.train_pixel_accuracy,
                label: 'Training Pixel Accuracy',
                color: '#1976d2',
                showMark: false
              },
              {
                data: chartData.val_pixel_accuracy,
                label: 'Validation Pixel Accuracy',
                color: '#dc004e',
                showMark: false
              }
            ]}
            height={400}
            margin={{ left: 80, right: 20, top: 20, bottom: 60 }}
          />
        </Box>
      ) : (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No pixel accuracy data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default PixelAccuracyChart;