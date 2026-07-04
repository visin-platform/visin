import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface MIoUChartProps {
  epochs: Epoch[];
}

const MIoUChart: React.FC<MIoUChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_miou = sortedEpochs.map(e => e.results?.train?.mean_iou ?? 0);
    const val_miou = sortedEpochs.map(e => e.results?.val?.mean_iou ?? 0);

    return {
      epochs: epochs_data,
      train_miou,
      val_miou
    };
  }, [epochs]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation MIoU
      </Typography>
      {chartData.train_miou.some(v => v > 0) || chartData.val_miou.some(v => v > 0) ? (
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
                data: chartData.train_miou,
                label: 'Training MIoU',
                color: '#1976d2',
                showMark: false
              },
              {
                data: chartData.val_miou,
                label: 'Validation MIoU',
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
          No MIoU data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default MIoUChart;