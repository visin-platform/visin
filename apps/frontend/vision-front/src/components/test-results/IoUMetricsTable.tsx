import React, { useState } from 'react';
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
import type { ComparisonData, ConditionAggregates } from './performanceMetricsUtils';

interface IoUMetricsTableProps {
  comparisonData: ComparisonData[];
  decimals?: number;
  multiplier?: number;
  classFilter?: string[];
}

const IoUMetricsTable: React.FC<IoUMetricsTableProps> = ({
  comparisonData,
  decimals = 4,
  multiplier = 1,
  classFilter
}) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');
  const [sortStates, setSortStates] = useState<{[condition: string]: {column: string, direction: 'asc' | 'desc'}}>({
    'day_fair': {column: 'training', direction: 'asc'},
    'night_fair': {column: 'training', direction: 'asc'},
    'day_rain': {column: 'training', direction: 'asc'},
    'night_rain': {column: 'training', direction: 'asc'},
    'snow': {column: 'training', direction: 'asc'}
  });

  const formatNumber = (value: number | undefined): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return (value * multiplier).toFixed(decimals);
    }
    return 'N/A';
  };

  // Handle column sorting for a specific condition
  const handleSort = (condition: string, column: string) => {
    setSortStates(prev => {
      const current = prev[condition];
      if (current.column === column) {
        return {
          ...prev,
          [condition]: {
            column,
            direction: current.direction === 'asc' ? 'desc' : 'asc'
          }
        };
      } else {
        return {
          ...prev,
          [condition]: {
            column,
            direction: 'desc'
          }
        };
      }
    });
  };

  // Get sorted data for a specific condition
  const getSortedData = (condition: string) => {
    const { column, direction } = sortStates[condition];
    return [...comparisonData].sort((a, b) => {
      let aValue: number = -Infinity;
      let bValue: number = -Infinity;
      let aString: string = '';
      let bString: string = '';

      if (column === 'training') {
        aString = a.training.name.toLowerCase();
        bString = b.training.name.toLowerCase();
      } else {
        // For class columns, extract IoU mean value
        const conditionDataA = a.aggregatedResults?.[condition] as ConditionAggregates | undefined;
        const conditionDataB = b.aggregatedResults?.[condition] as ConditionAggregates | undefined;
        const classMetricsA = conditionDataA?.[column];
        const classMetricsB = conditionDataB?.[column];
        aValue = classMetricsA?.iou?.mean ?? -Infinity;
        bValue = classMetricsB?.iou?.mean ?? -Infinity;
      }

      // Handle string comparison for training names
      if (column === 'training') {
        const comparison = aString.localeCompare(bString);
        return direction === 'asc' ? comparison : -comparison;
      }

      // Handle numeric comparison
      const comparison = aValue - bValue;
      return direction === 'asc' ? comparison : -comparison;
    });
  };

  // Helper component for sortable table headers
  const SortableTableCell = ({ 
    condition,
    column, 
    children, 
    align = 'center' 
  }: { 
    condition: string;
    column: string; 
    children: React.ReactNode; 
    align?: 'left' | 'center' | 'right' 
  }) => {
    const { column: sortColumn, direction: sortDirection } = sortStates[condition];
    return (
      <TableCell align={align}>
        <Box 
          sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.04)' }
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

  // Helper function to find the best (maximum) IoU value for each class across all trainings per condition
  const getBestIoUValues = (condition: string, className: string) => {
    let bestIoU = -Infinity;

    comparisonData.forEach((comp) => {
      const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
      const classMetrics = conditionData?.[className];
      const iouValue = classMetrics?.iou?.mean;

      if (iouValue !== undefined && iouValue > bestIoU) {
        bestIoU = iouValue;
      }
    });

    return bestIoU;
  };

  // Generate LaTeX for IoU metrics for a specific condition
  const generateConditionLatex = (condition: string) => {
    const conditionTitle = condition.replace('_', ' ').toUpperCase();

    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{IoU Metrics - ${conditionTitle}${classFilter ? ` - ${classFilter.join(', ')}` : ''}}\n\\label{tab:iou_metrics_${condition}}\n`;
    latex += `\\begin{tabular}{|l|${'c|'.repeat(classNames.length)}}\n\\hline\n`;

    // Header row with class names
    latex += 'Training & ';
    classNames.forEach((className, index) => {
      const classTitle = className.charAt(0).toUpperCase() + className.slice(1);
      latex += `${classTitle} IoU`;
      if (index < classNames.length - 1) {
        latex += ' & ';
      }
    });
    latex += ' \\\\\n\\hline\n';

    // Data rows for each training
    comparisonData.forEach(comp => {
      const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      latex += `${trainingName} `;

      classNames.forEach((className) => {
        const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
        const classMetrics = conditionData?.[className];
        const bestIoU = getBestIoUValues(condition, className);

        if (classMetrics?.iou?.mean !== undefined) {
          const isBest = classMetrics.iou.mean === bestIoU;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.iou.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }
      });

      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = (condition: string) => {
    const latex = generateConditionLatex(condition);
    const conditionTitle = condition.replace('_', ' ').toUpperCase();
    const filterTitle = classFilter ? ` - ${classFilter.join(', ')}` : '';
    setLatexCode(latex);
    setLatexTitle(`IoU Metrics LaTeX Code - ${conditionTitle}${filterTitle}`);
    setLatexModalOpen(true);
  };

  if (comparisonData.length === 0) return null;

  const allClassNames = ['human', 'sign', 'vehicle'];
  const classNames = classFilter ? allClassNames.filter(name => classFilter.includes(name)) : allClassNames;

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
          IoU Metrics Comparison{classFilter ? ` - ${classFilter.join(', ')}` : ''}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mt: 1
          }}>
          Test results showing IoU (Intersection over Union) metrics for different weather conditions{classFilter ? ` and ${classFilter.join(', ')} classes` : ' and object classes'}
        </Typography>
      </Box>
      {['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => {
        const conditionTitle = condition.replace('_', ' ').toUpperCase();
        return (
          <Paper key={condition} sx={{ mb: 3, mx: 3 }}>
            <Box sx={{ p: 2, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'grey.50' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {conditionTitle}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={<CodeIcon />}
                onClick={() => handleGenerateLatex(condition)}
                disabled={comparisonData.length === 0}
              >
                LaTeX
              </Button>
            </Box>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <SortableTableCell condition={condition} column="training" align="left">
                      Test Result
                    </SortableTableCell>
                    {classNames.map((className) => (
                      <SortableTableCell
                        key={className}
                        condition={condition}
                        column={className}
                      >
                        {className.charAt(0).toUpperCase() + className.slice(1)} IoU
                      </SortableTableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getSortedData(condition).map((comp) => {
                    return (
                      <TableRow key={comp.training._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'grey.25' } }}>
                        <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 150 }}>
                          <Link
                            to={`/trainings/${comp.training._id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                              {comp.training.name}
                            </Typography>
                          </Link>
                        </TableCell>
                        {classNames.map((className) => {
                          const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
                          const classMetrics = conditionData?.[className];
                          const bestIoU = getBestIoUValues(condition, className);

                          return (
                            <TableCell
                              key={className}
                              align="center"
                              sx={{
                                borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                              }}
                            >
                              {classMetrics?.iou?.mean !== undefined ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontSize: '0.75rem',
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.iou.mean === bestIoU ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.iou.mean)}
                                </Typography>
                              ) : (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    fontSize: '0.75rem'
                                  }}>
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          );
                        })}
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

export default IoUMetricsTable;