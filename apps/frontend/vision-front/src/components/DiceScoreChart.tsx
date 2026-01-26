import React from 'react';
import { Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { Epoch } from '../types';
import { useMobileChartTooltip } from '../hooks/useMobileChartTooltip';

interface DiceScoreChartProps {
  epochs: Epoch[];
}

const DiceScoreChart: React.FC<DiceScoreChartProps> = ({ epochs }) => {
  const { isMobile } = useMobileChartTooltip();
  // Prepare chart data from epochs
  const chartData = React.useMemo(() => {
    const sortedEpochs = [...epochs].sort((a, b) => a.epoch - b.epoch);

    const epochs_data = sortedEpochs.map(e => e.epoch);
    const train_dice_score = sortedEpochs.map(e => e.results?.train?.dice_score ?? 0);
    const val_dice_score = sortedEpochs.map(e => e.results?.val?.dice_score ?? 0);

    return {
      epochs: epochs_data,
      train_dice_score,
      val_dice_score
    };
  }, [epochs]);

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom>
        Training and Validation Dice Score
      </Typography>
      {chartData.train_dice_score.some(v => v > 0) || chartData.val_dice_score.some(v => v > 0) ? (
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
                data: chartData.train_dice_score,
                label: 'Training Dice Score',
                color: '#1976d2',
                showMark: false
              },
              {
                data: chartData.val_dice_score,
                label: 'Validation Dice Score',
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
          No dice score data available for this training
        </Typography>
      )}
    </Box>
  );
};

export default DiceScoreChart;