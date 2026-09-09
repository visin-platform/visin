import React, { useMemo } from 'react';
import {
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Box,
  Stack,
  IconButton,
  Tooltip,
  Typography,
  useTheme,
  alpha
} from '@mui/material';
import { Code as CodeIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TestResult } from '../../types';
import ConfusionMatrix from './ConfusionMatrix';
import { isRecord, readMetric } from '../../taxonomy/discover';
import { useTaxonomyFor } from '../../taxonomy/useTaxonomy';
import { humanize } from '../../taxonomy/humanize';

/** Per-class metric columns, grouped one block per metric. */
const CLASS_METRICS = ['iou', 'precision', 'recall', 'ap'];

interface TestResultTableProps {
  testResult: TestResult;
  onLatexExport: (testResult: TestResult) => void;
  onDeleteTestResult?: (testResultId: string) => void;
  isAuthenticated: boolean;
}

const TestResultTable: React.FC<TestResultTableProps> = ({
  testResult,
  onLatexExport,
  onDeleteTestResult,
  isAuthenticated
}) => {
  const theme = useTheme();

  const results = useMemo(() => [testResult], [testResult]);
  const taxonomy = useTaxonomyFor(results);

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  // Only conditions this result actually carries get a row.
  const conditions = taxonomy.conditions.filter(condition =>
    isRecord(testResult.test_results?.[condition.key])
  );
  const classes = taxonomy.classes;
  const overallMetrics = taxonomy.overallMetrics;

  const overallBlock = testResult.test_results?.overall;

  /** Confusion-matrix axis labels, from the payload where it supplies them. */
  const matrixLabels = (labels: unknown): string[] | undefined =>
    Array.isArray(labels) && labels.every(l => typeof l === 'string')
      ? labels.map(humanize)
      : undefined;

  const conditionMatrix = (conditionKey: string) => {
    const block = testResult.test_results?.[conditionKey];
    if (!isRecord(block) || !isRecord(block.overall)) {
      return { matrix: undefined, labels: undefined };
    }
    const matrix = block.overall.confusion_matrix;
    return {
      matrix: Array.isArray(matrix) && matrix.length > 0 ? (matrix as number[][]) : undefined,
      labels: matrixLabels(block.overall.confusion_matrix_labels)
    };
  };

  const perClassColumns = CLASS_METRICS.length * classes.length;

  return (
    <Paper
      elevation={0}
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper'
      }}
    >
      <Box
        sx={{
          p: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: `1px solid ${theme.palette.divider}`
        }}>
        <Box>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<CodeIcon />}
            onClick={() => onLatexExport(testResult)}
            size="small"
          >
            Export LaTeX
          </Button>
          {onDeleteTestResult && isAuthenticated && (
            <Tooltip title="Delete Result">
              <IconButton
                size="small"
                onClick={() => onDeleteTestResult(testResult._id)}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.1) }
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
              <TableCell rowSpan={2} sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}>
                {taxonomy.conditionLabel}
              </TableCell>
              {CLASS_METRICS.map(metric => (
                <TableCell
                  key={metric}
                  colSpan={classes.length}
                  align="center"
                  sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontWeight: 600 }}
                >
                  {taxonomy.metric(metric).label}
                </TableCell>
              ))}
              {overallMetrics.length > 0 && (
                <TableCell colSpan={overallMetrics.length} align="center" sx={{ fontWeight: 600 }}>
                  Overall Metrics
                </TableCell>
              )}
            </TableRow>
            <TableRow sx={{ bgcolor: alpha(theme.palette.action.hover, 0.5) }}>
              {CLASS_METRICS.map(metric =>
                classes.map((className, index) => (
                  <TableCell
                    key={`${metric}-${className.key}`}
                    align="center"
                    sx={{
                      fontSize: '0.75rem',
                      ...(index === classes.length - 1
                        ? { borderRight: `1px solid ${theme.palette.divider}` }
                        : {})
                    }}
                  >
                    {className.label}
                  </TableCell>
                ))
              )}
              {overallMetrics.map(metric => (
                <TableCell key={metric.key} align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                  {metric.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {conditions.map(condition => {
              const conditionData = testResult.test_results[condition.key];
              if (!isRecord(conditionData)) return null;
              const overall = conditionData.overall;

              return (
                <TableRow key={condition.key} hover>
                  <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                    {condition.label}
                  </TableCell>
                  {CLASS_METRICS.map(metric =>
                    classes.map((className, index) => (
                      <TableCell
                        key={`${metric}-${className.key}`}
                        align="center"
                        sx={{
                          fontFamily: 'monospace',
                          ...(index === classes.length - 1
                            ? { borderRight: `1px solid ${theme.palette.divider}` }
                            : {})
                        }}
                      >
                        {formatNumber(readMetric(conditionData[className.key], metric))}
                      </TableCell>
                    ))
                  )}
                  {overallMetrics.map(metric => (
                    <TableCell key={metric.key} align="center" sx={{ fontFamily: 'monospace' }}>
                      {formatNumber(readMetric(overall, metric.key), metric.decimals)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {/* Overall row for all conditions combined */}
            {isRecord(overallBlock) && (
              <TableRow hover sx={{ bgcolor: alpha(theme.palette.secondary.main, 0.04) }}>
                <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${theme.palette.divider}` }}>
                  All
                </TableCell>
                {perClassColumns > 0 && (
                  <TableCell
                    colSpan={perClassColumns}
                    align="center"
                    sx={{ borderRight: `1px solid ${theme.palette.divider}`, fontStyle: 'italic' }}
                  >
                    -
                  </TableCell>
                )}
                {overallMetrics.map(metric => (
                  <TableCell key={metric.key} align="center" sx={{ fontFamily: 'monospace' }}>
                    {formatNumber(readMetric(overallBlock, metric.key), metric.decimals)}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Confusion Matrices */}
      <Box sx={{ p: 2, pt: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
          Confusion Matrices
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Overall confusion matrix across all conditions */}
          {(() => {
            const found = conditions.map(condition => conditionMatrix(condition.key));
            const matrices = found
              .map(f => f.matrix)
              .filter((matrix): matrix is number[][] => matrix !== undefined);

            if (matrices.length === 0) return null;

            // Axis labels come from the payload; without them the matrix is
            // indexed by position, which is still honest about what it shows.
            const labels =
              found.find(f => f.labels !== undefined)?.labels ??
              matrices[0].map((_, index) => `Class ${index}`);

            const matrixSize = matrices[0].length;
            const overallMatrix = Array(matrixSize).fill(0).map(() => Array(matrixSize).fill(0));

            matrices.forEach(matrix => {
              for (let i = 0; i < matrixSize; i++) {
                for (let j = 0; j < matrixSize; j++) {
                  overallMatrix[i][j] += matrix[i]?.[j] || 0;
                }
              }
            });

            return (
              <ConfusionMatrix
                key="overall"
                confusionMatrix={overallMatrix}
                title={`Overall Confusion Matrix (All ${taxonomy.conditionLabel}s)`}
                classNames={labels}
              />
            );
          })()}

          {/* Individual condition confusion matrices */}
          {conditions.map(condition => {
            const { matrix, labels } = conditionMatrix(condition.key);
            if (!matrix) return null;

            return (
              <ConfusionMatrix
                key={condition.key}
                confusionMatrix={matrix}
                title={`${condition.label} Confusion Matrix`}
                classNames={labels ?? matrix.map((_, index) => `Class ${index}`)}
              />
            );
          })}
        </Box>
      </Box>
    </Paper>
  );
};

export default TestResultTable;
