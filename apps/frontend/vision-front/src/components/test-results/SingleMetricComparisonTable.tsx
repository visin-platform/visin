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
import type { ComparisonData, ConditionAggregates } from './performanceMetricsUtils';

/**
 * One metric, every class, broken out per condition — the shape the IoU and AP
 * tables both had, character for character apart from the metric name. Kept as one
 * component so a third metric is a wrapper rather than another 350-line copy.
 */

interface SingleMetricComparisonTableProps {
  comparisonData: ComparisonData[];
  /** the metric key to show, e.g. 'iou' or 'ap' */
  metric: string;
  /** heading, e.g. "IoU Metrics Comparison" */
  title: string;
  /** sentence under the heading; receives the resolved condition-axis wording */
  describe: (conditionLabel: string, classesLabel: string) => string;
  /** prefix for the LaTeX modal title and \label, e.g. 'IoU' / 'iou' */
  latexName: string;
  latexLabelPrefix: string;
  decimals?: number;
  multiplier?: number;
  classFilter?: string[];
}

interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

const DEFAULT_SORT: SortState = { column: 'training', direction: 'asc' };

const escapeLatex = (value: string) => value.replace(/[&%$#_{}~^\\]/g, '\\$&');

const SingleMetricComparisonTable: React.FC<SingleMetricComparisonTableProps> = ({
  comparisonData,
  metric,
  title,
  describe,
  latexName,
  latexLabelPrefix,
  decimals = 4,
  multiplier = 1,
  classFilter
}) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const [sortStates, setSortStates] = useState<{ [condition: string]: SortState }>({});

  const projectTaxonomy = useTaxonomy();
  const { taxonomy, conditions, classes } = useMemo(
    () => discoverAggregateVocabulary(comparisonData, projectTaxonomy, [metric]),
    [comparisonData, projectTaxonomy, metric]
  );

  const shownClasses = classFilter
    ? classes.filter(term => classFilter.includes(term.key))
    : classes;

  const formatNumber = (value: number): string => (value * multiplier).toFixed(decimals);

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

  const valueOf = (comp: ComparisonData, condition: string, className: string) => {
    const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
    return conditionData?.[className]?.[metric]?.mean;
  };

  const getSortedData = (condition: string) => {
    const { column, direction } = sortFor(condition);
    return [...comparisonData].sort((a, b) => {
      if (column === 'training') {
        const comparison = a.training.name.toLowerCase().localeCompare(b.training.name.toLowerCase());
        return direction === 'asc' ? comparison : -comparison;
      }
      const comparison =
        (valueOf(a, condition, column) ?? -Infinity) - (valueOf(b, condition, column) ?? -Infinity);
      return direction === 'asc' ? comparison : -comparison;
    });
  };

  /** Best value for one class in one condition — direction-aware, so a
   *  lower-is-better metric highlights its minimum. */
  const bestValueFor = (condition: string, className: string): number | undefined =>
    taxonomy.best(
      metric,
      comparisonData
        .map(comp => valueOf(comp, condition, className))
        .filter((value): value is number => value !== undefined)
    );

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

  const metricLabel = taxonomy.metric(metric).label;

  const generateConditionLatex = (condition: string, conditionTitle: string) => {
    const filterTitle = classFilter ? ` - ${classFilter.join(', ')}` : '';
    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{${latexName} Metrics - ${conditionTitle}${filterTitle}}\n\\label{tab:${latexLabelPrefix}_metrics_${condition}}\n`;
    latex += `\\begin{tabular}{|l|${'c|'.repeat(shownClasses.length)}}\n\\hline\n`;
    latex += `Training & ${shownClasses.map(c => `${c.label} ${metricLabel}`).join(' & ')} \\\\\n\\hline\n`;

    comparisonData.forEach(comp => {
      latex += `${escapeLatex(comp.training.name)} `;
      shownClasses.forEach(className => {
        const value = valueOf(comp, condition, className.key);
        if (value !== undefined) {
          const isBest = value === bestValueFor(condition, className.key);
          latex += `& ${isBest ? '\\textbf{' : ''}${formatNumber(value)}${isBest ? '}' : ''} `;
        } else {
          latex += '& N/A ';
        }
      });
      latex += '\\\\ \\hline\n';
    });

    return `${latex}\\end{tabular}\n\\end{table*}`;
  };

  const handleGenerateLatex = (condition: string, conditionTitle: string) => {
    const filterTitle = classFilter ? ` - ${classFilter.join(', ')}` : '';
    setLatexCode(generateConditionLatex(condition, conditionTitle));
    setLatexTitle(`${latexName} Metrics LaTeX Code - ${conditionTitle}${filterTitle}`);
    setLatexModalOpen(true);
  };

  if (comparisonData.length === 0) return null;

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
          {title}{classFilter ? ` - ${classFilter.join(', ')}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
          {describe(
            taxonomy.conditionLabel.toLowerCase(),
            classFilter ? `${classFilter.join(', ')} classes` : 'classes'
          )}
        </Typography>
      </Box>
      {conditions.map(condition => {
        const conditionTitle = condition.label.toUpperCase();
        return (
          <Paper key={condition.key} sx={{ mb: 3, mx: 3 }}>
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
                    <SortableTableCell condition={condition.key} column="training" align="left">
                      Test Result
                    </SortableTableCell>
                    {shownClasses.map(className => (
                      <SortableTableCell
                        key={className.key}
                        condition={condition.key}
                        column={className.key}
                      >
                        {className.label} {metricLabel}
                      </SortableTableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getSortedData(condition.key).map(comp => (
                    <TableRow key={comp.training._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                      <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 150 }}>
                        <Link to={`/trainings/${comp.training._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                            {comp.training.name}
                          </Typography>
                        </Link>
                      </TableCell>
                      {shownClasses.map(className => {
                        const value = valueOf(comp, condition.key, className.key);
                        return (
                          <MetricCell
                            key={className.key}
                            value={value}
                            format={formatNumber}
                            best={value !== undefined && value === bestValueFor(condition.key, className.key)}
                          />
                        );
                      })}
                    </TableRow>
                  ))}
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

export default SingleMetricComparisonTable;
