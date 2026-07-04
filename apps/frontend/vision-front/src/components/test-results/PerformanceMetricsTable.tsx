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

interface ComparisonData {
  aggregatedResults: any;
  training: { _id: string; name: string };
  testResultsCount: number;
}

interface PerformanceMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex?: () => void;
  decimals?: number;
  multiplier?: number;
}

const PerformanceMetricsTable: React.FC<PerformanceMetricsTableProps> = ({
  comparisonData,
  decimals = 4,
  multiplier = 1
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
      } else if (column === 'overall_fw_iou') {
        // Handle overall FW IoU sorting
        const conditionDataA = a.aggregatedResults?.[condition];
        const conditionDataB = b.aggregatedResults?.[condition];
        aValue = conditionDataA?.overall?.fw_iou?.mean ?? -Infinity;
        bValue = conditionDataB?.overall?.fw_iou?.mean ?? -Infinity;
      } else {
        // Parse column format: "class_metric" (e.g., "human_iou", "sign_precision")
        const [className, metric] = column.split('_');
        const conditionDataA = a.aggregatedResults?.[condition];
        const conditionDataB = b.aggregatedResults?.[condition];
        const classMetricsA = conditionDataA?.[className];
        const classMetricsB = conditionDataB?.[className];
        aValue = classMetricsA?.[metric]?.mean ?? -Infinity;
        bValue = classMetricsB?.[metric]?.mean ?? -Infinity;
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

  // Generate LaTeX for a specific performance metrics condition
  const generateConditionLatex = (condition: string) => {
    const classNames = ['human', 'sign', 'vehicle'];
    const conditionTitle = condition.replace('_', ' ').toUpperCase();

    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{Test Results Performance Metrics - ${conditionTitle}}\n\\label{tab:performance_metrics_${condition}}\n`;
    latex += `\\begin{tabular}{|l|${'c|c|c|c|c|'.repeat(classNames.length)}c|}\n\\hline\n`;

    // Header row with class names
    latex += 'Training & ';
    classNames.forEach((className, index) => {
      const classTitle = className.charAt(0).toUpperCase() + className.slice(1);
      latex += `${classTitle} IoU & ${classTitle} Prec. & ${classTitle} Rec. & ${classTitle} F1 & ${classTitle} AP`;
      if (index < classNames.length - 1) {
        latex += ' & ';
      }
    });
    latex += ' & FW IoU \\\\\n\\hline\n';

    // Data rows for each training
    comparisonData.forEach(comp => {
      const trainingName = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const conditionData = comp.aggregatedResults?.[condition];
      latex += `${trainingName} `;

      classNames.forEach((className) => {
        const classMetrics = conditionData?.[className];
        const bestValues = getBestValues(condition, className);

        // IoU
        if (classMetrics?.iou?.mean !== undefined) {
          const isBest = classMetrics.iou.mean === bestValues.iou;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.iou.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }

        // Precision
        if (classMetrics?.precision?.mean !== undefined) {
          const isBest = classMetrics.precision.mean === bestValues.precision;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.precision.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }

        // Recall
        if (classMetrics?.recall?.mean !== undefined) {
          const isBest = classMetrics.recall.mean === bestValues.recall;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.recall.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }

        // F1
        if (classMetrics?.f1_score?.mean !== undefined) {
          const isBest = classMetrics.f1_score.mean === bestValues.f1_score;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.f1_score.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }

        // AP
        if (classMetrics?.ap?.mean !== undefined) {
          const isBest = classMetrics.ap.mean === bestValues.ap;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${(classMetrics.ap.mean * multiplier).toFixed(decimals)}${boldEnd} `;
        } else {
          latex += '& N/A ';
        }
      });

      // FW IoU
      if (conditionData?.overall?.fw_iou?.mean !== undefined) {
        latex += `& ${(conditionData.overall.fw_iou.mean * multiplier).toFixed(decimals)} `;
      } else {
        latex += '& N/A ';
      }

      latex += '\\\\ \\hline\n';
    });

    latex += '\\end{tabular}\n\\end{table*}';

    return latex;
  };

  const handleGenerateLatex = (condition: string) => {
    const latex = generateConditionLatex(condition);
    const conditionTitle = condition.replace('_', ' ').toUpperCase();
    setLatexCode(latex);
    setLatexTitle(`Performance Metrics LaTeX Code - ${conditionTitle}`);
    setLatexModalOpen(true);
  };

  const formatNumber = (value: any): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return (value * multiplier).toFixed(decimals);
    }
    return 'N/A';
  };

  // Helper function to find the best (maximum) value for each metric across all trainings
  const getBestValues = (condition: string, className: string) => {
    const bestValues: { [key: string]: number } = {};
    
    comparisonData.forEach((comp) => {
      const conditionData = comp.aggregatedResults?.[condition];
      const classMetrics = conditionData?.[className];
      
      if (classMetrics) {
        ['iou', 'precision', 'recall', 'f1_score', 'ap'].forEach((metric) => {
          const metricData = classMetrics[metric];
          if (metricData?.mean !== undefined) {
            if (bestValues[metric] === undefined || metricData.mean > bestValues[metric]) {
              bestValues[metric] = metricData.mean;
            }
          }
        });
      }
    });
    
    return bestValues;
  };

  if (comparisonData.length === 0) return null;

  // Class names are consistent across all trainings based on API structure
  const classNames = ['human', 'sign', 'vehicle'];

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
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mt: 1
          }}>
          Performance metrics (IoU, Precision, Recall, F1) for different weather conditions and object classes
        </Typography>
      </Box>
      {['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => {
        const conditionTitle = condition.replace('_', ' ').toUpperCase();
        return (
          <Paper key={condition} sx={{ mb: 3 }}>
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
                    <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 120 }}>
                      Test Result
                    </TableCell>
                  {classNames.map((className) => (
                    <TableCell
                      key={className}
                      colSpan={5}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        borderRight: '1px solid rgba(224, 224, 224, 1)'
                      }}
                    >
                      {className.charAt(0).toUpperCase() + className.slice(1)}
                    </TableCell>
                  ))}
                    <TableCell
                      colSpan={1}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        borderRight: 'none'
                      }}
                    >
                      Overall
                    </TableCell>
                  </TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <SortableTableCell condition={condition} column="training" align="left">
                    {condition.replace('_', ' ').toUpperCase()}
                  </SortableTableCell>
                  {classNames.map((className) => (
                    <React.Fragment key={className}>
                      <SortableTableCell condition={condition} column={`${className}_iou`}>IoU</SortableTableCell>
                      <SortableTableCell condition={condition} column={`${className}_precision`}>Precision</SortableTableCell>
                      <SortableTableCell condition={condition} column={`${className}_recall`}>Recall</SortableTableCell>
                      <SortableTableCell condition={condition} column={`${className}_f1_score`}>F1</SortableTableCell>
                      <SortableTableCell condition={condition} column={`${className}_ap`}>AP</SortableTableCell>
                    </React.Fragment>
                  ))}
                  <SortableTableCell condition={condition} column="overall_fw_iou">FW IoU</SortableTableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getSortedData(condition).map((comp) => {
                  const conditionData = comp.aggregatedResults?.[condition];
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
                        const conditionData = comp.aggregatedResults?.[condition];
                        const classMetrics = conditionData?.[className];
                        const bestValues = getBestValues(condition, className);

                        return (
                          <React.Fragment key={className}>
                            <TableCell align="center">
                              {classMetrics?.iou?.mean !== undefined ? (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.iou.mean === bestValues.iou ? 'bold' : 'normal'
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
                            <TableCell align="center">
                              {classMetrics?.precision?.mean !== undefined ? (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.precision.mean === bestValues.precision ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.precision.mean)}
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
                            <TableCell align="center">
                              {classMetrics?.recall?.mean !== undefined ? (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.recall.mean === bestValues.recall ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.recall.mean)}
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
                            <TableCell align="center">
                              {classMetrics?.f1_score?.mean !== undefined ? (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.f1_score.mean === bestValues.f1_score ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.f1_score.mean)}
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
                            <TableCell
                              align="center"
                              sx={{
                                borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                              }}
                            >
                              {classMetrics?.ap?.mean !== undefined ? (
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    fontSize: '0.75rem', 
                                    whiteSpace: 'nowrap',
                                    fontWeight: classMetrics.ap.mean === bestValues.ap ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.ap.mean)}
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
                          </React.Fragment>
                        );
                      })}
                      <TableCell align="center">
                        {conditionData?.overall?.fw_iou?.mean !== undefined ? (
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontSize: '0.75rem', 
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {formatNumber(conditionData.overall.fw_iou.mean)}
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