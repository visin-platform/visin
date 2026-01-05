import React, { useState } from 'react';
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
  Button
} from '@mui/material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
import { TrainingComparison } from '../../types';
import LatexModal from '../common/LatexModal';

interface TrainingValidationMetricsTableProps {
  comparisonData: TrainingComparison[];
}

interface ValidationMetrics {
  meanIoU?: { mean: number; std: number };
  meanPrecision?: { mean: number; std: number };
  meanRecall?: { mean: number; std: number };
  meanF1?: { mean: number; std: number };
}

interface TrainingMetricsData {
  training: TrainingComparison['training'];
  metrics: ValidationMetrics | null;
}

const TrainingValidationMetricsTable: React.FC<TrainingValidationMetricsTableProps> = ({ comparisonData }) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Calculate validation metrics for each training
  const trainingMetrics: TrainingMetricsData[] = React.useMemo(() => {
    return comparisonData.map(comp => {
      const epochs = comp.epochs;
      if (epochs.length === 0) {
        return {
          training: comp.training,
          metrics: null
        };
      }

      // Sort epochs by validation IoU (descending) and take top 10
      const sortedEpochs = epochs
        .filter(epoch => epoch.results?.val?.mean_iou !== undefined)
        .sort((a, b) => (b.results?.val?.mean_iou ?? 0) - (a.results?.val?.mean_iou ?? 0))
        .slice(0, 10);

      if (sortedEpochs.length === 0) {
        return {
          training: comp.training,
          metrics: null
        };
      }

      const avgMetrics: ValidationMetrics = {};

      // Calculate mean and std for IoU
      const iouValues = sortedEpochs.map(epoch => epoch.results?.val?.mean_iou).filter(val => val !== undefined) as number[];
      if (iouValues.length > 0) {
        const mean = iouValues.reduce((sum, val) => sum + val, 0) / iouValues.length;
        const variance = iouValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / iouValues.length;
        const std = Math.sqrt(variance);
        avgMetrics.meanIoU = { mean, std };
      }

      // Calculate precision, recall, F1 from class metrics (averaged across classes and top epochs)
      const classMetrics: { precision: number[], recall: number[], f1: number[] } = {
        precision: [], recall: [], f1: []
      };

      sortedEpochs.forEach(epoch => {
        const valResults = epoch.results?.val;
        if (valResults) {
          Object.keys(valResults).forEach(key => {
            if (key !== 'loss' && key !== 'mean_iou' && key !== 'val_loss') {
              const classData = valResults[key];
              if (classData && typeof classData === 'object') {
                if (typeof classData.precision === 'number') classMetrics.precision.push(classData.precision);
                if (typeof classData.recall === 'number') classMetrics.recall.push(classData.recall);
                if (typeof (classData.f1_score || classData.f1) === 'number') {
                  classMetrics.f1.push(classData.f1_score || classData.f1);
                }
              }
            }
          });
        }
      });

      // Calculate mean and std for precision
      if (classMetrics.precision.length > 0) {
        const mean = classMetrics.precision.reduce((sum, val) => sum + val, 0) / classMetrics.precision.length;
        const variance = classMetrics.precision.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / classMetrics.precision.length;
        const std = Math.sqrt(variance);
        avgMetrics.meanPrecision = { mean, std };
      }

      // Calculate mean and std for recall
      if (classMetrics.recall.length > 0) {
        const mean = classMetrics.recall.reduce((sum, val) => sum + val, 0) / classMetrics.recall.length;
        const variance = classMetrics.recall.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / classMetrics.recall.length;
        const std = Math.sqrt(variance);
        avgMetrics.meanRecall = { mean, std };
      }

      // Calculate mean and std for F1
      if (classMetrics.f1.length > 0) {
        const mean = classMetrics.f1.reduce((sum, val) => sum + val, 0) / classMetrics.f1.length;
        const variance = classMetrics.f1.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / classMetrics.f1.length;
        const std = Math.sqrt(variance);
        avgMetrics.meanF1 = { mean, std };
      }

      return {
        training: comp.training,
        metrics: avgMetrics
      };
    });
  }, [comparisonData]);

  // Filter trainings that have validation metrics
  const trainingsWithMetrics: TrainingMetricsData[] = trainingMetrics.filter(t => t.metrics !== null);

  // Find best (highest) values for each metric
  const bestValues = React.useMemo(() => {
    const best = {
      meanIoU: -Infinity,
      meanPrecision: -Infinity,
      meanRecall: -Infinity,
      meanF1: -Infinity
    };

    trainingsWithMetrics.forEach(trainingData => {
      if (trainingData.metrics) {
        if (trainingData.metrics.meanIoU && trainingData.metrics.meanIoU.mean > best.meanIoU) {
          best.meanIoU = trainingData.metrics.meanIoU.mean;
        }
        if (trainingData.metrics.meanPrecision && trainingData.metrics.meanPrecision.mean > best.meanPrecision) {
          best.meanPrecision = trainingData.metrics.meanPrecision.mean;
        }
        if (trainingData.metrics.meanRecall && trainingData.metrics.meanRecall.mean > best.meanRecall) {
          best.meanRecall = trainingData.metrics.meanRecall.mean;
        }
        if (trainingData.metrics.meanF1 && trainingData.metrics.meanF1.mean > best.meanF1) {
          best.meanF1 = trainingData.metrics.meanF1.mean;
        }
      }
    });

    return best;
  }, [trainingsWithMetrics]);

  // Helper function to format mean ± std
  const formatMeanStd = (metric: { mean: number; std: number } | undefined, decimals: number = 2): string => {
    if (!metric) return 'N/A';
    return `${formatNumber(metric.mean, decimals)} ± ${formatNumber(metric.std, decimals)}`;
  };

  // Helper function to render cell with conditional bold styling
  const renderMetricCell = (
    metric: { mean: number; std: number } | undefined,
    bestValue: number,
    decimals: number = 3
  ) => {
    const isBest = metric && metric.mean === bestValue;
    return (
      <Typography
        variant="body2"
        sx={{
          fontWeight: isBest ? 700 : 400,
          color: isBest ? 'black' : 'inherit'
        }}
      >
        {formatMeanStd(metric, decimals)}
      </Typography>
    );
  };

  // Generate LaTeX for training validation metrics table
  const generateValidationMetricsLatex = () => {
    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Training Validation Metrics (Top 10 Epochs by IoU)}\n\\label{tab:validation_metrics}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\n`;

    // Header row
    latex += 'Training & Val mIoU & Precision & Recall & F1 \\\\\n\\hline\n';

    // Data rows - one per training
    trainingsWithMetrics.forEach(trainingData => {
      const trainingName = trainingData.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');

      // Training name
      latex += `${trainingName} `;

      // Val mIoU
      if (trainingData.metrics?.meanIoU) {
        const isBestIoU = trainingData.metrics.meanIoU.mean === bestValues.meanIoU;
        const boldStart = isBestIoU ? '\\textbf{' : '';
        const boldEnd = isBestIoU ? '}' : '';
        latex += `& ${boldStart}${formatNumber(trainingData.metrics.meanIoU.mean, 2)} ± ${formatNumber(trainingData.metrics.meanIoU.std, 2)}${boldEnd} `;
      } else {
        latex += '& N/A ';
      }

      // Precision
      if (trainingData.metrics?.meanPrecision) {
        const isBestPrecision = trainingData.metrics.meanPrecision.mean === bestValues.meanPrecision;
        const boldStart = isBestPrecision ? '\\textbf{' : '';
        const boldEnd = isBestPrecision ? '}' : '';
        latex += `& ${boldStart}${formatNumber(trainingData.metrics.meanPrecision.mean, 2)} ± ${formatNumber(trainingData.metrics.meanPrecision.std, 2)}${boldEnd} `;
      } else {
        latex += '& N/A ';
      }

      // Recall
      if (trainingData.metrics?.meanRecall) {
        const isBestRecall = trainingData.metrics.meanRecall.mean === bestValues.meanRecall;
        const boldStart = isBestRecall ? '\\textbf{' : '';
        const boldEnd = isBestRecall ? '}' : '';
        latex += `& ${boldStart}${formatNumber(trainingData.metrics.meanRecall.mean, 2)} ± ${formatNumber(trainingData.metrics.meanRecall.std, 2)}${boldEnd} `;
      } else {
        latex += '& N/A ';
      }

      // F1
      if (trainingData.metrics?.meanF1) {
        const isBestF1 = trainingData.metrics.meanF1.mean === bestValues.meanF1;
        const boldStart = isBestF1 ? '\\textbf{' : '';
        const boldEnd = isBestF1 ? '}' : '';
        latex += `& ${boldStart}${formatNumber(trainingData.metrics.meanF1.mean, 2)} ± ${formatNumber(trainingData.metrics.meanF1.std, 2)}${boldEnd} `;
      } else {
        latex += '& N/A ';
      }

      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = () => {
    const latex = generateValidationMetricsLatex();
    setLatexCode(latex);
    setLatexTitle('Training Validation Metrics LaTeX Code');
    setLatexModalOpen(true);
  };

  if (trainingsWithMetrics.length === 0) {
    return (
      <Paper
        sx={{
          mb: 4,
          boxShadow: `0 4px 12px ${alpha(theme.palette.grey[500], 0.2)}`,
          bgcolor: alpha(theme.palette.grey[50], 0.5),
          border: `1px solid ${alpha(theme.palette.grey[300], 0.5)}`
        }}
      >
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No Validation Metrics Available
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Validation metrics from training epochs will appear here once trainings have validation data
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        mb: 4,
        boxShadow: `0 4px 12px ${alpha(theme.palette.grey[500], 0.2)}`,
        bgcolor: alpha(theme.palette.grey[50], 0.5),
        border: `1px solid ${alpha(theme.palette.grey[300], 0.5)}`
      }}
    >
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Training Validation Metrics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Mean ± standard deviation from the top 10 epochs sorted by validation IoU
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={<CodeIcon />}
          onClick={handleGenerateLatex}
          disabled={trainingsWithMetrics.length === 0}
        >
          LaTeX
        </Button>
      </Box>

      <TableContainer>
        <Table>
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <TableCell><strong>Training</strong></TableCell>
              <TableCell align="center"><strong>Val mIoU</strong></TableCell>
              <TableCell align="center"><strong>Precision</strong></TableCell>
              <TableCell align="center"><strong>Recall</strong></TableCell>
              <TableCell align="center"><strong>F1</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trainingsWithMetrics.map((trainingData: TrainingMetricsData) => (
              <TableRow key={trainingData.training._id}>
                <TableCell>
                  <Link
                    to={`/trainings/${trainingData.training._id}`}
                    style={{ textDecoration: 'none' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'black' }}>
                      {trainingData.training.name}
                    </Typography>
                  </Link>
                </TableCell>
                <TableCell align="center">
                  {renderMetricCell(trainingData.metrics?.meanIoU, bestValues.meanIoU, 4)}
                </TableCell>
                <TableCell align="center">
                  {renderMetricCell(trainingData.metrics?.meanPrecision, bestValues.meanPrecision, 4)}
                </TableCell>
                <TableCell align="center">
                  {renderMetricCell(trainingData.metrics?.meanRecall, bestValues.meanRecall, 4)}
                </TableCell>
                <TableCell align="center">
                  {renderMetricCell(trainingData.metrics?.meanF1, bestValues.meanF1, 4)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
      />
    </Paper>
  );
};

export default TrainingValidationMetricsTable;