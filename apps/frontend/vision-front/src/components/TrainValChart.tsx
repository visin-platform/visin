import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useChartColors } from '@visin/frontend-core';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';
import { isReported } from '../taxonomy/discover';

interface TrainValChartProps {
  epochs: Epoch[];
  /** Key of the metric under `results.train` / `results.val`. */
  metric: string;
  /** Display name, used in the title and the series labels ("Loss", "Mean IoU"). */
  label: string;
}

const TrainValChart: React.FC<TrainValChartProps> = ({ epochs, metric, label }) => {
  const { isMobile } = useMobileChartTooltip();
  const colors = useChartColors();

  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);
    // An epoch that did not report the metric is a gap in the line, not a drop to zero. Results are open
    // blobs, so a value that is not a finite number (an object-shaped entry, a string) is a gap as well.
    const read = (split: 'train' | 'val') =>
      sortedEpochs.map(e => {
        const value: unknown = e.results?.[split]?.[metric];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
      });

    return { epochs: sortedEpochs.map(e => e.epoch), train: read('train'), val: read('val') };
  }, [epochs, metric]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation {label}
      </Typography>
      {chartData.train.some(isReported) || chartData.val.some(isReported) ? (
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
                data: chartData.train,
                label: `Training ${label}`,
                color: colors.slot(0),
                showMark: false
              },
              {
                data: chartData.val,
                label: `Validation ${label}`,
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
          No {label} data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default TrainValChart;
