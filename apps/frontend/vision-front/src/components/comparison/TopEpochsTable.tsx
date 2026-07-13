import React from 'react';
import {
  Paper,
  Box,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  alpha,
  useTheme,
  Chip
} from '@mui/material';
import { Link } from 'react-router-dom';
import { TrainingComparison, ComparisonEpoch, EpochMetrics } from '../../types';

interface TopEpochsTableProps {
  comparisonData: TrainingComparison[];
}

interface EpochWithMetrics {
  trainingName: string;
  trainingId: string;
  epoch: number;
  timestamp: string;
  epoch_time?: number;
  meanIoU?: number;
  meanPrecision?: number;
  meanRecall?: number;
  meanF1?: number;
  loss?: number;
  val_loss?: number;
}

const TopEpochsTable: React.FC<TopEpochsTableProps> = ({ comparisonData }) => {
  const theme = useTheme();

  // Extract all epochs with their metrics
  const allEpochsWithMetrics: EpochWithMetrics[] = React.useMemo(() => {
    const epochs: EpochWithMetrics[] = [];

    comparisonData.forEach(training => {
      training.epochs.forEach((epoch: ComparisonEpoch) => {
        const valResults = epoch.results?.val;
        if (valResults) {
          // Extract metrics from validation results
          const meanIoU = valResults.mean_iou;
          const loss = valResults.loss;
          const val_loss = valResults.val_loss;

          // Calculate mean precision, recall, F1 from class metrics if available
          let meanPrecision: number | undefined;
          let meanRecall: number | undefined;
          let meanF1: number | undefined;

          const classKeys = Object.keys(valResults).filter(key =>
            key !== 'loss' && key !== 'mean_iou' && key !== 'val_loss' &&
            typeof valResults[key] === 'object' && valResults[key] !== null
          );

          if (classKeys.length > 0) {
            const precisions: number[] = [];
            const recalls: number[] = [];
            const f1s: number[] = [];

            classKeys.forEach(classKey => {
              const classMetrics = valResults[classKey] as EpochMetrics | undefined;
              if (classMetrics && typeof classMetrics === 'object') {
                if (typeof classMetrics.precision === 'number') precisions.push(classMetrics.precision);
                if (typeof classMetrics.recall === 'number') recalls.push(classMetrics.recall);
                if (typeof classMetrics.f1_score === 'number' || typeof classMetrics.f1 === 'number') {
                  f1s.push((classMetrics.f1_score ?? classMetrics.f1) as number);
                }
              }
            });

            if (precisions.length > 0) meanPrecision = precisions.reduce((a, b) => a + b, 0) / precisions.length;
            if (recalls.length > 0) meanRecall = recalls.reduce((a, b) => a + b, 0) / recalls.length;
            if (f1s.length > 0) meanF1 = f1s.reduce((a, b) => a + b, 0) / f1s.length;
          }

          epochs.push({
            trainingName: training.training.name,
            trainingId: training.training._id,
            epoch: epoch.epoch,
            timestamp: epoch.timestamp,
            epoch_time: epoch.epoch_time,
            meanIoU: typeof meanIoU === 'number' ? meanIoU : undefined,
            meanPrecision,
            meanRecall,
            meanF1,
            loss: typeof loss === 'number' ? loss : undefined,
            val_loss: typeof val_loss === 'number' ? val_loss : undefined
          });
        }
      });
    });

    // Sort by mean IoU (descending), then by epoch number (descending)
    return epochs.sort((a, b) => {
      const aIoU = a.meanIoU || -1;
      const bIoU = b.meanIoU || -1;
      if (aIoU !== bIoU) return bIoU - aIoU;
      return b.epoch - a.epoch;
    });
  }, [comparisonData]);

  // Take top 10 epochs
  const topEpochs = allEpochsWithMetrics.slice(0, 10);

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  const formatTime = (seconds: number | undefined): string => {
    if (typeof seconds === 'number' && !isNaN(seconds)) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return 'N/A';
  };

  if (topEpochs.length === 0) {
    return (
      <Paper
        sx={{
          p: 4,
          textAlign: 'center',
          borderRadius: 2,
          border: `1px solid ${theme.palette.divider}`,
          bgcolor: 'background.paper'
        }}
      >
        <Typography variant="h6" gutterBottom sx={{
          color: "text.secondary"
        }}>
          No Epoch Data Available
        </Typography>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No validation metrics found in the training epochs
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        mb: 4,
        boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
      }}
    >
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Top 10 Best Epochs
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 2
          }}>
          Ranked by validation mean IoU across all compared trainings
        </Typography>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell sx={{ fontWeight: 600, minWidth: 60 }}>Rank</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 120 }}>Training</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 80 }}>Epoch</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>IoU</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Precision</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Recall</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>F1</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Val Loss</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 100 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 600, minWidth: 120 }}>Timestamp</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {topEpochs.map((epoch, index) => (
              <TableRow key={`${epoch.trainingId}-${epoch.epoch}`} sx={{ '&:nth-of-type(odd)': { bgcolor: 'grey.25' } }}>
                <TableCell sx={{ fontWeight: 600, color: theme.palette.primary.main }}>
                  #{index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    to={`/trainings/${epoch.trainingId}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                      {epoch.trainingName}
                    </Typography>
                  </Link>
                </TableCell>
                <TableCell>
                  <Chip
                    label={`Epoch ${epoch.epoch}`}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: epoch.meanIoU ? 600 : 'normal' }}>
                  {formatNumber(epoch.meanIoU, 3)}
                </TableCell>
                <TableCell>
                  {formatNumber(epoch.meanPrecision, 3)}
                </TableCell>
                <TableCell>
                  {formatNumber(epoch.meanRecall, 3)}
                </TableCell>
                <TableCell>
                  {formatNumber(epoch.meanF1, 3)}
                </TableCell>
                <TableCell>
                  {formatNumber(epoch.val_loss, 4)}
                </TableCell>
                <TableCell>
                  {formatTime(epoch.epoch_time)}
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {new Date(epoch.timestamp).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default TopEpochsTable;