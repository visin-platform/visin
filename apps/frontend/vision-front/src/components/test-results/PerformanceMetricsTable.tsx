import React, { useMemo, useState } from 'react';
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
  alpha,
  useTheme
} from '@mui/material';
import {
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon
} from '@mui/icons-material';
import { Code as CodeIcon } from '@mui/icons-material';
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

interface PerformanceMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex?: () => void;
  decimals?: number;
  multiplier?: number;
}

interface SortState {
  column: string;
  direction: 'asc' | 'desc';
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
  // Keyed by condition, filled lazily: the set of conditions is discovered, so
  // there is no fixed list to seed this from.
  const [sortStates, setSortStates] = useState<{ [condition: string]: SortState }>({});

  const projectTaxonomy = useTaxonomy();
  const { taxonomy, conditions, classes, metrics } = useMemo(
    () => discoverAggregateVocabulary(comparisonData, projectTaxonomy, DEFAULT_CLASS_METRICS),
    [comparisonData, projectTaxonomy]
  );

  const sortFor = (condition: string) => sortStates[condition] ?? DEFAULT_SORT;

  const handleSort = (condition: string, column: string) => {
    setSortStates(prev => {
      const current = prev[condition] ?? DEFAULT_SORT;
      return {
        ...prev,
        [condition]:
          current.column === column
            ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { column, direction: 'desc' }
      };
    });
  };

  const getSortedData = (condition: string) => {
    const { column, direction } = sortFor(condition);
    return sortComparisonData(comparisonData, condition, column, direction);
  };

  const SortableTableCell = ({
    condition,
    column,
    children,
    align = 'center'
  }: {
    condition: string;
    column: string;
    children: React.ReactNode;
    align?: 'left' | 'center' | 'right';
  }) => {
    const { column: sortColumn, direction: sortDirection } = sortFor(condition);
    return (
      <TableCell align={align}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' }
          }}
          onClick={() => handleSort(condition, column)}
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
        boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
        bgcolor: alpha(theme.palette.primary.main, 0.05),
        border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
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
                    <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 120 }}>
                      Test Result
                    </TableCell>
                    {classes.map(className => (
                      <TableCell
                        key={className.key}
                        colSpan={metrics.length}
                        align="center"
                        sx={{ fontWeight: 600, borderRight: '1px solid rgba(224, 224, 224, 1)' }}
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
                    <SortableTableCell condition={condition.key} column="training" align="left">
                      {conditionTitle}
                    </SortableTableCell>
                    {classes.map(className => (
                      <React.Fragment key={className.key}>
                        {metrics.map(metric => (
                          <SortableTableCell
                            key={metric.key}
                            condition={condition.key}
                            column={`${className.key}_${metric.key}`}
                          >
                            {metric.label}
                          </SortableTableCell>
                        ))}
                      </React.Fragment>
                    ))}
                    {summaryMetric && (
                      <SortableTableCell condition={condition.key} column={`overall_${summaryMetric.key}`}>
                        {summaryMetric.label}
                      </SortableTableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getSortedData(condition.key).map(comp => {
                    const conditionData = comp.aggregatedResults?.[condition.key] as ConditionAggregates | undefined;
                    return (
                      <TableRow key={comp.training._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                        <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 150 }}>
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
                                        ? '1px solid rgba(224, 224, 224, 1)'
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
