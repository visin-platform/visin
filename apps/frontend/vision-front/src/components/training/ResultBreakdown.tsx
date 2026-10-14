import React, { useMemo } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme
} from '@mui/material';
import { livePalette, tint } from '@visin/frontend-core';
import type { RunEvaluation, EvaluationResults } from '../../types';
import ConfusionMatrix from './ConfusionMatrix';
import { discoverClassMetrics, isRecord, readMetric } from '../../taxonomy/discover';
import { useTaxonomyFor } from '../../taxonomy/useTaxonomy';
import { humanize } from '../../taxonomy/humanize';
import MetricName from '../common/MetricName';

/** Per-class metric columns a run's test result is laid out with, one block per metric. */
const CLASS_METRICS = ['iou', 'precision', 'recall', 'ap'];

interface ResultBreakdownProps {
  /** a result blob: condition, then class, then metrics, with an `overall` beside either */
  results: EvaluationResults;
  /**
   * Which per-class metrics get a column block. Without it, the usual four. `discover` takes the ones the result
   * really reports, in the usual order first, for a result from an evaluator that names its own.
   */
  classMetrics?: string[] | 'discover';
}

/**
 * A result laid out by condition: one row each, a column block per metric with a column for every class, the
 * overall figures, an "All" row, and the confusion matrices. The vocabulary is read from the result itself, so any
 * conditions, classes and metrics lay out the same way; a project's taxonomy only names and orders them.
 */
const ResultBreakdown: React.FC<ResultBreakdownProps> = ({ results: resultData, classMetrics }) => {
  const theme = useTheme();

  const evaluation = useMemo(() => ({ test_results: resultData }) as RunEvaluation, [resultData]);
  const results = useMemo(() => [evaluation], [evaluation]);
  const taxonomy = useTaxonomyFor(results);

  const shownMetrics = useMemo(() => {
    if (classMetrics !== 'discover') return classMetrics ?? CLASS_METRICS;
    const found = discoverClassMetrics(results);
    return [
      ...CLASS_METRICS.filter((metric) => found.includes(metric)),
      ...found.filter((metric) => !CLASS_METRICS.includes(metric))
    ];
  }, [classMetrics, results]);

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return '-';
  };

  // Only conditions this result actually carries get a row.
  const conditions = taxonomy.conditions.filter((condition) => isRecord(evaluation.test_results?.[condition.key]));
  const classes = taxonomy.classes;
  const overallMetrics = taxonomy.overallMetrics;

  const overallBlock = evaluation.test_results?.overall;

  /** Confusion-matrix axis labels, from the payload where it supplies them. */
  const matrixLabels = (labels: unknown): string[] | undefined =>
    Array.isArray(labels) && labels.every((l) => typeof l === 'string') ? labels.map(humanize) : undefined;

  const conditionMatrix = (conditionKey: string) => {
    const block = evaluation.test_results?.[conditionKey];
    if (!isRecord(block) || !isRecord(block.overall)) {
      return { matrix: undefined, labels: undefined };
    }
    const matrix = block.overall.confusion_matrix;
    return {
      matrix: Array.isArray(matrix) && matrix.length > 0 ? (matrix as number[][]) : undefined,
      labels: matrixLabels(block.overall.confusion_matrix_labels)
    };
  };

  const hasMatrix = conditions.some((condition) => conditionMatrix(condition.key).matrix !== undefined);

  const perClassColumns = shownMetrics.length * classes.length;

  return (
    <>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: tint(livePalette(theme).action.hover, 0.5) }}>
              <TableCell rowSpan={2} sx={{ borderRight: `1px solid ${livePalette(theme).divider}`, fontWeight: 600 }}>
                {taxonomy.conditionLabel}
              </TableCell>
              {shownMetrics.map((metric) => (
                <TableCell
                  key={metric}
                  colSpan={classes.length}
                  align="center"
                  sx={{ borderRight: `1px solid ${livePalette(theme).divider}`, fontWeight: 600 }}
                >
                  <MetricName label={taxonomy.metric(metric).label} description={taxonomy.metric(metric).description} />
                </TableCell>
              ))}
              {overallMetrics.length > 0 && (
                <TableCell colSpan={overallMetrics.length} align="center" sx={{ fontWeight: 600 }}>
                  Overall Metrics
                </TableCell>
              )}
            </TableRow>
            <TableRow sx={{ bgcolor: tint(livePalette(theme).action.hover, 0.5) }}>
              {shownMetrics.map((metric) =>
                classes.map((className, index) => (
                  <TableCell
                    key={`${metric}-${className.key}`}
                    align="center"
                    sx={{
                      fontSize: '0.75rem',
                      ...(index === classes.length - 1
                        ? { borderRight: `1px solid ${livePalette(theme).divider}` }
                        : {})
                    }}
                  >
                    {className.label}
                  </TableCell>
                ))
              )}
              {overallMetrics.map((metric) => (
                <TableCell key={metric.key} align="center" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>
                  <MetricName label={metric.label} description={metric.description} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {conditions.map((condition) => {
              const conditionData = evaluation.test_results[condition.key];
              if (!isRecord(conditionData)) return null;
              const overall = conditionData.overall;

              return (
                <TableRow key={condition.key} hover>
                  <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${livePalette(theme).divider}` }}>
                    {condition.label}
                  </TableCell>
                  {shownMetrics.map((metric) =>
                    classes.map((className, index) => (
                      <TableCell
                        key={`${metric}-${className.key}`}
                        align="center"
                        sx={{
                          fontFamily: 'monospace',
                          ...(index === classes.length - 1
                            ? { borderRight: `1px solid ${livePalette(theme).divider}` }
                            : {})
                        }}
                      >
                        {formatNumber(readMetric(conditionData[className.key], metric))}
                      </TableCell>
                    ))
                  )}
                  {overallMetrics.map((metric) => (
                    <TableCell key={metric.key} align="center" sx={{ fontFamily: 'monospace' }}>
                      {formatNumber(readMetric(overall, metric.key), metric.decimals)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {/* Overall row for all conditions combined */}
            {isRecord(overallBlock) && (
              <TableRow hover sx={{ bgcolor: tint(livePalette(theme).secondary.main, 0.04) }}>
                <TableCell sx={{ fontWeight: 600, borderRight: `1px solid ${livePalette(theme).divider}` }}>
                  All
                </TableCell>
                {perClassColumns > 0 && (
                  <TableCell
                    colSpan={perClassColumns}
                    align="center"
                    sx={{ borderRight: `1px solid ${livePalette(theme).divider}`, fontStyle: 'italic' }}
                  >
                    -
                  </TableCell>
                )}
                {overallMetrics.map((metric) => (
                  <TableCell key={metric.key} align="center" sx={{ fontFamily: 'monospace' }}>
                    {formatNumber(readMetric(overallBlock, metric.key), metric.decimals)}
                  </TableCell>
                ))}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {/* Confusion Matrices: only where the result carries one, rather than a heading over nothing */}
      {hasMatrix && (
        <Box sx={{ p: 2, pt: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
            Confusion Matrices
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Overall confusion matrix across all conditions */}
            {(() => {
              const found = conditions.map((condition) => conditionMatrix(condition.key));
              const matrices = found
                .map((f) => f.matrix)
                .filter((matrix): matrix is number[][] => matrix !== undefined);

              if (matrices.length === 0) return null;

              // Axis labels come from the payload; without them the matrix is
              // indexed by position, which is still honest about what it shows.
              const labels =
                found.find((f) => f.labels !== undefined)?.labels ?? matrices[0].map((_, index) => `Class ${index}`);

              const matrixSize = matrices[0].length;
              const overallMatrix = Array(matrixSize)
                .fill(0)
                .map(() => Array(matrixSize).fill(0));

              matrices.forEach((matrix) => {
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
            {conditions.map((condition) => {
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
      )}
    </>
  );
};

export default ResultBreakdown;
