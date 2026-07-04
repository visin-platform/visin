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
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { Code as CodeIcon } from '@mui/icons-material';
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
  const [sortColumn, setSortColumn] = useState<string>('meanIoU');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Handle column sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  // Helper component for sortable table headers
  const SortableTableCell = ({ 
    column, 
    children, 
    align = 'center' 
  }: { 
    column: string; 
    children: React.ReactNode; 
    align?: 'left' | 'center' | 'right' 
  }) => (
    <TableCell align={align}>
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' }
        }}
        onClick={() => handleSort(column)}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
          {children}
        </Typography>
        {sortColumn === column && (
          sortDirection === 'asc' ? 
            <ArrowUpwardIcon sx={{ fontSize: 16 }} /> : 
            <ArrowDownwardIcon sx={{ fontSize: 16 }} />
        )}
      </Box>
    </TableCell>
  );

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
          color: isBest ? 'black' : 'inherit'
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
          boxShadow: `0 4px 12px ${alpha(theme.palette.grey[500], 0.2)}`,
          bgcolor: alpha(theme.palette.grey[50], 0.5),
          border: `1px solid ${alpha(theme.palette.grey[300], 0.5)}`
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
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              <SortableTableCell column="training" align="left">Training</SortableTableCell>
              <SortableTableCell column="meanIoU">Val mIoU</SortableTableCell>
              <SortableTableCell column="meanPrecision">Precision</SortableTableCell>
              <SortableTableCell column="meanRecall">Recall</SortableTableCell>
              <SortableTableCell column="meanF1">F1</SortableTableCell>
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