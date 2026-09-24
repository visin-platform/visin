import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useChartColors } from '@visin/frontend-core';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

// A pipeline that does not compute a metric often writes 0 for it: a line of
// nothing but zeros is "not reported", not a result.
const isReported = (value: number | null) => value !== null && value !== 0;

interface LossChartProps {
  epochs: Epoch[];
}

const LossChart: React.FC<LossChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  const colors = useChartColors();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);
    // An epoch that did not report the metric is a gap in the line, not a drop to zero.

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_loss = sortedEpochs.map(e => e.results?.train?.loss ?? null);
    const val_loss = sortedEpochs.map(e => e.results?.val?.loss ?? null);

    return {
      epochs: epochs_data,
      train_loss,
      val_loss
    };
  }, [epochs]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation Loss
      </Typography>
      {chartData.train_loss.some(isReported) || chartData.val_loss.some(isReported) ? (
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
                data: chartData.train_loss,
                label: 'Training Loss',
                color: colors.slot(0),
                showMark: false
              },
              {
                data: chartData.val_loss,
                label: 'Validation Loss',
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
          No loss data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default LossChart;