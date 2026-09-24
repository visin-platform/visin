import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useChartColors } from '@visin/frontend-core';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

// A pipeline that does not compute a metric often writes 0 for it: a line of
// nothing but zeros is "not reported", not a result.
const isReported = (value: number | null) => value !== null && value !== 0;

interface MIoUChartProps {
  epochs: Epoch[];
}

const MIoUChart: React.FC<MIoUChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  const colors = useChartColors();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);
    // An epoch that did not report the metric is a gap in the line, not a drop to zero.

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_miou = sortedEpochs.map(e => e.results?.train?.mean_iou ?? null);
    const val_miou = sortedEpochs.map(e => e.results?.val?.mean_iou ?? null);

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
      {chartData.train_miou.some(isReported) || chartData.val_miou.some(isReported) ? (
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
                color: colors.slot(0),
                showMark: false
              },
              {
                data: chartData.val_miou,
                label: 'Validation MIoU',
                color: colors.slot(1),
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