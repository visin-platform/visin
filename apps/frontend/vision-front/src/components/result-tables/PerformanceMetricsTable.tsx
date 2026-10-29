import React, { useMemo, useState } from 'react';
import SortableTableCell from '../comparison/SortableTableCell';
import { useKeyedColumnSort, type SortState } from '../comparison/useColumnSort';
import {
  Paper,
  Box,
  Typography,
  Button,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  useTheme
} from '@mui/material';
import { Code as CodeIcon } from '@mui/icons-material';
import { livePalette, tint, surface } from '@visin/frontend-core';
import { Link } from 'react-router-dom';
import LatexModal from '../common/LatexModal';
import MetricCell from './MetricCell';
import { useTaxonomy } from '../../taxonomy/useTaxonomy';
import { discoverAggregateVocabulary } from './aggregateVocabulary';
import {
  type ComparisonData,
  type ConditionAggregates,
  DEFAULT_CLASS_METRICS,
  getBestValues,
  sortComparisonData,
  formatMetricNumber,
  generateConditionLatex
} from './performanceMetricsUtils';
import MetricName from '../common/MetricName';

interface PerformanceMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex?: () => void;
  decimals?: number;
  multiplier?: number;
}

const DEFAULT_SORT: SortState = { column: 'training', direction: 'asc' };

const PerformanceMetricsTable: React.FC<PerformanceMetricsTableProps> = ({
  comparisonData,
  decimals = 4,
  multiplier = 1
}) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  // One sort per condition's table.
  const { sortFor, sortProps } = useKeyedColumnSort(DEFAULT_SORT);

  const projectTaxonomy = useTaxonomy();
  const { taxonomy, conditions, classes, metrics } = useMemo(
    () => discoverAggregateVocabulary(comparisonData, projectTaxonomy, DEFAULT_CLASS_METRICS),
    [comparisonData, projectTaxonomy]
  );

  const getSortedData = (condition: string) => {
    const { column, direction } = sortFor(condition);
    return sortComparisonData(comparisonData, condition, column, direction);
  };

  const handleGenerateLatex = (condition: string, conditionTitle: string) => {
    setLatexCode(
      generateConditionLatex(
        comparisonData,
        condition,
        decimals,
        multiplier,
        taxonomy,
        classes.map(c => c.key),
        metrics.map(m => m.key)
      )
    );
    setLatexTitle(`Performance Metrics LaTeX Code - ${conditionTitle}`);
    setLatexModalOpen(true);
  };

  const formatNumber = (value: unknown): string => formatMetricNumber(value, decimals, multiplier);

  if (comparisonData.length === 0) return null;

  const summaryMetric = taxonomy.overallMetrics[0];
  const metricLabels = metrics.map(m => m.label).join(', ');

  return (
    <Paper
      sx={{
        mb: 4,
        boxShadow: `0 4px 12px ${tint(livePalette(theme).primary.main, 0.2)}`,
        bgcolor: tint(livePalette(theme).primary.main, 0.05),
        border: `1px solid ${tint(livePalette(theme).primary.main, 0.1)}`
      }}
    >
      <Box sx={{ p: 3, pb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Performance Metrics Comparison
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {metricLabels ? `Performance metrics (${metricLabels})` : 'Performance metrics'} by{' '}
          {taxonomy.conditionLabel.toLowerCase()} and class
        </Typography>
      </Box>
      {conditions.map(condition => {
        const conditionTitle = condition.label.toUpperCase();
        return (
          <Paper key={condition.key} sx={{ mb: 3 }}>
            <Box sx={{ p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.default' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {conditionTitle}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CodeIcon />}
                onClick={() => handleGenerateLatex(condition.key, conditionTitle)}
                disabled={comparisonData.length === 0}
              >
                LaTeX
              </Button>
            </Box>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <TableCell sx={{ fontWeight: 600, borderRight: `2px solid ${surface.divider}`, minWidth: 120 }}>
                      Evaluation
                    </TableCell>
                    {classes.map(className => (
                      <TableCell
                        key={className.key}
                        colSpan={metrics.length}
                        align="center"
                        sx={{ fontWeight: 600, borderRight: `1px solid ${surface.divider}` }}
                      >
                        {className.label}
                      </TableCell>
                    ))}
                    {summaryMetric && (
                      <TableCell colSpan={1} align="center" sx={{ fontWeight: 600, borderRight: 'none' }}>
                        Overall
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow sx={{ bgcolor: 'background.default' }}>
                    <SortableTableCell {...sortProps(condition.key)} column="training" align="left">
                      {conditionTitle}
                    </SortableTableCell>
                    {classes.map(className => (
                      <React.Fragment key={className.key}>
                        {metrics.map(metric => (
                          <SortableTableCell
                            {...sortProps(condition.key)}
                            key={metric.key}
                            column={`${className.key}_${metric.key}`}
                            align="center"
                          >
                            <MetricName label={metric.label} description={metric.description} />
                          </SortableTableCell>
                        ))}
                      </React.Fragment>
                    ))}
                    {summaryMetric && (
                      <SortableTableCell
                        {...sortProps(condition.key)}
                        column={`overall_${summaryMetric.key}`}
                        align="center"
                      >
                        <MetricName label={summaryMetric.label} description={summaryMetric.description} />
                      </SortableTableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getSortedData(condition.key).map(comp => {
                    const conditionData = comp.aggregatedResults?.[condition.key] as ConditionAggregates | undefined;
                    return (
                      <TableRow key={comp.training._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                        <TableCell sx={{ fontWeight: 600, borderRight: `2px solid ${surface.divider}`, minWidth: 150 }}>
                          <Link to={`/trainings/${comp.training._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                              {comp.training.name}
                            </Typography>
                          </Link>
                        </TableCell>
                        {classes.map((className, classIndex) => {
                          const classMetrics = conditionData?.[className.key];
                          const bestValues = getBestValues(
                            comparisonData,
                            condition.key,
                            className.key,
                            taxonomy,
                            metrics.map(m => m.key)
                          );
                          const isLastClass = classIndex === classes.length - 1;

                          return (
                            <React.Fragment key={className.key}>
                              {metrics.map((metric, metricIndex) => {
                                const mean = classMetrics?.[metric.key]?.mean;
                                return (
                                  <MetricCell
                                    key={metric.key}
                                    value={mean}
                                    format={formatNumber}
                                    best={mean !== undefined && mean === bestValues[metric.key]}
                                    borderRight={
                                      metricIndex === metrics.length - 1 && !isLastClass
                                        ? `1px solid ${surface.divider}`
                                        : undefined
                                    }
                                  />
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        {summaryMetric && (
                          <MetricCell
                            value={conditionData?.overall?.[summaryMetric.key]?.mean}
                            format={formatNumber}
                          />
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        );
      })}
      <LatexModal
        open={latexModalOpen}
        onClose={() => setLatexModalOpen(false)}
        title={latexTitle}
        code={latexCode}
      />
    </Paper>
  );
};

export default PerformanceMetricsTable;
