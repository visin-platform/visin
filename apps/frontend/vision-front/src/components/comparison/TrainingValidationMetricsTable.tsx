import React, { useState } from 'react';
import SortableTableCell from './SortableTableCell';
import { useColumnSort } from './useColumnSort';
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
  useTheme,
  Button
} from '@mui/material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
import { livePalette, tint, surface } from '@visin/frontend-core';
import { TrainingComparison } from '../../types';
import LatexModal from '../common/LatexModal';
import {
  type TrainingMetricsData,
  computeTrainingMetrics,
  sortTrainingsWithMetrics,
  computeBestValues,
  formatMeanStd,
  generateValidationMetricsLatex
} from './trainingValidationMetricsUtils';

interface TrainingValidationMetricsTableProps {
  comparisonData: TrainingComparison[];
  decimals?: number;
  multiplier?: number;
}

const TrainingValidationMetricsTable: React.FC<TrainingValidationMetricsTableProps> = ({
  comparisonData,
  decimals = 2,
  multiplier = 100
}) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const sort = useColumnSort('meanIoU', 'desc');
  const { sortColumn, sortDirection } = sort;

  // Calculate validation metrics for each training
  const trainingMetrics: TrainingMetricsData[] = React.useMemo(
    () => computeTrainingMetrics(comparisonData),
    [comparisonData]
  );

  const trainingsWithMetrics: TrainingMetricsData[] = React.useMemo(
    () => sortTrainingsWithMetrics(trainingMetrics, sortColumn, sortDirection),
    [trainingMetrics, sortColumn, sortDirection]
  );

  const bestValues = React.useMemo(
    () => computeBestValues(trainingsWithMetrics),
    [trainingsWithMetrics]
  );

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
          color: isBest ? 'text.primary' : 'inherit'
        }}
      >
        {formatMeanStd(metric, decimals)}
      </Typography>
    );
  };

  const handleGenerateLatex = () => {
    const latex = generateValidationMetricsLatex(trainingsWithMetrics, bestValues, decimals, multiplier);
    setLatexCode(latex);
    setLatexTitle('Training Validation Metrics LaTeX Code');
    setLatexModalOpen(true);
  };

  if (trainingsWithMetrics.length === 0) {
    return (
      <Paper
        sx={{
          mb: 4,
          boxShadow: `0 4px 12px ${tint(livePalette(theme).text.secondary, 0.15)}`,
          bgcolor: surface.sunken,
          border: `1px solid ${surface.divider}`
        }}
      >
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom sx={{
            color: "text.secondary"
          }}>
            No Validation Metrics Available
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
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
        boxShadow: `0 4px 12px ${tint(livePalette(theme).text.secondary, 0.15)}`,
        bgcolor: surface.sunken,
        border: `1px solid ${surface.divider}`
      }}
    >
      <Box sx={{ p: 3, pb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Training Validation Metrics
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1
            }}>
            Mean ± standard deviation from the top 10 epochs sorted by validation IoU. Precision, recall, and F1 are averaged across classes per epoch before calculating statistics.
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
            <TableRow sx={{ bgcolor: 'background.default' }}>
              <SortableTableCell {...sort} column="training" align="left">Training</SortableTableCell>
              <SortableTableCell {...sort} column="meanIoU" align="center">Val mIoU</SortableTableCell>
              <SortableTableCell {...sort} column="meanPrecision" align="center">Precision</SortableTableCell>
              <SortableTableCell {...sort} column="meanRecall" align="center">Recall</SortableTableCell>
              <SortableTableCell {...sort} column="meanF1" align="center">F1</SortableTableCell>
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
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
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
