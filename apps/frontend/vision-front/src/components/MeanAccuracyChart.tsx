import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface MeanAccuracyChartProps {
  epochs: Epoch[];
}

const MeanAccuracyChart: React.FC<MeanAccuracyChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_mean_accuracy = sortedEpochs.map(e => e.results?.train?.mean_accuracy ?? 0);
    const val_mean_accuracy = sortedEpochs.map(e => e.results?.val?.mean_accuracy ?? 0);

    return {
      epochs: epochs_data,
      train_mean_accuracy,
      val_mean_accuracy
    };
  }, [epochs]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation Mean Accuracy
      </Typography>
      {chartData.train_mean_accuracy.some(v => v > 0) || chartData.val_mean_accuracy.some(v => v > 0) ? (
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
                data: chartData.train_mean_accuracy,
                label: 'Training Mean Accuracy',
                color: '#1976d2',
                showMark: false
              },
              {
                data: chartData.val_mean_accuracy,
                label: 'Validation Mean Accuracy',
                color: '#dc004e',
                showMark: false
              }
            ]}
            height={400}
            margin={{ left: 80, right: 20, top: 20, bottom: 60 }}
          />
        </Box>
      ) : (
        <Typography
          sx={{
            color: "text.secondary",
            textAlign: 'center',
            py: 4
          }}>
          No mean accuracy data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default MeanAccuracyChart;