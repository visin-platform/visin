import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useChartColors } from '@visin/frontend-core';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';
import { isReported } from '../taxonomy/discover';
import type { MetricDirection } from '../types/taxonomy';
import { bestEpoch, formatReading } from './charts/bestEpoch';
import { BestEpochMarker } from './charts/BestEpochMarker';

interface TrainValChartProps {
  epochs: Epoch[];
  /** Key of the metric under `results.train` / `results.val`. */
  metric: string;
  /** Display name, used in the title and the series labels ("Loss", "Mean IoU"). */
  label: string;
  /** Which way is better, from the project's taxonomy: for a loss, the best epoch is the lowest. */
  direction?: MetricDirection;
}

const TrainValChart: React.FC<TrainValChartProps> = ({ epochs, metric, label, direction = 'higher' }) => {
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

  // The checkpoint anyone would keep is the best validation epoch; a run that reports no validation is judged on
  // its training readings instead.
  const best = React.useMemo(() => {
    const val = bestEpoch(chartData.epochs, chartData.val, direction);
    if (val) return { ...val, split: 'validation' as const, slot: 1 };
    const train = bestEpoch(chartData.epochs, chartData.train, direction);
    return train ? { ...train, split: 'training' as const, slot: 0 } : null;
  }, [chartData, direction]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom={!best}>
        Training and Validation {label}
      </Typography>
      {best && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
          Best {best.split} {label} {formatReading(best.value)} at epoch {best.epoch}
          {best.lastEpoch !== best.epoch && ` · ended at ${formatReading(best.last)} (epoch ${best.lastEpoch})`}
          {best.drifted && (
            <Box component="span" sx={{ color: 'warning.main' }}>
              {' '}· shaded: past the best
            </Box>
          )}
        </Typography>
      )}
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
          >
            {best && <BestEpochMarker best={best} color={colors.slot(best.slot)} />}
          </LineChart>
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
