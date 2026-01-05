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
import { Code as CodeIcon } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import LatexModal from '../common/LatexModal';

interface ComparisonData {
  aggregatedResults: any;
  training: { _id: string; name: string };
  testResultsCount: number;
}

interface APMetricsTableProps {
  comparisonData: ComparisonData[];
}

const APMetricsTable: React.FC<APMetricsTableProps> = ({
  comparisonData
}) => {
  const theme = useTheme();
  const [latexModalOpen, setLatexModalOpen] = useState(false);
  const [latexCode, setLatexCode] = useState('');
  const [latexTitle, setLatexTitle] = useState('');

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Helper function to find the best (maximum) AP value for each class across all trainings per condition
  const getBestAPValues = (condition: string, className: string) => {
    let bestAP = -Infinity;

    comparisonData.forEach((comp) => {
      const conditionData = comp.aggregatedResults?.[condition];
      const classMetrics = conditionData?.[className];
      const apValue = classMetrics?.ap?.mean;

      if (apValue !== undefined && apValue > bestAP) {
        bestAP = apValue;
      }
    });

    return bestAP;
  };

  // Generate LaTeX for AP metrics for a specific condition
  const generateConditionLatex = (condition: string) => {
    const classNames = ['human', 'sign', 'vehicle'];
    const conditionTitle = condition.replace('_', ' ').toUpperCase();

    let latex = `\\begin{table*}[t]\n\\centering\n\\caption{AP Metrics - ${conditionTitle}}\n\\label{tab:ap_metrics_${condition}}\n`;
    latex += `\\begin{tabular}{|l|${'c|'.repeat(classNames.length)}}\n\\hline\n`;

    // Header row with class names
    latex += 'Training & ';
    classNames.forEach((className, index) => {
      const classTitle = className.charAt(0).toUpperCase() + className.slice(1);
      latex += `${classTitle} AP`;
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
        const conditionData = comp.aggregatedResults?.[condition];
        const classMetrics = conditionData?.[className];
        const bestAP = getBestAPValues(condition, className);

        if (classMetrics?.ap?.mean !== undefined) {
          const isBest = classMetrics.ap.mean === bestAP;
          const boldStart = isBest ? '\\textbf{' : '';
          const boldEnd = isBest ? '}' : '';
          latex += `& ${boldStart}${formatNumber(classMetrics.ap.mean, 2)} ± ${formatNumber(classMetrics.ap.std, 2)}${boldEnd} `;
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
    setLatexCode(latex);
    setLatexTitle(`AP Metrics LaTeX Code - ${conditionTitle}`);
    setLatexModalOpen(true);
  };

  if (comparisonData.length === 0) return null;

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
          AP Metrics Comparison
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Test results showing AP (Average Precision) metrics for different weather conditions and object classes
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
                    <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 120 }}>
                      Test Result
                    </TableCell>
                    {classNames.map((className) => (
                      <TableCell
                        key={className}
                        align="center"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                        }}
                      >
                        {className.charAt(0).toUpperCase() + className.slice(1)} AP
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {comparisonData.map((comp) => {
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
                          const bestAP = getBestAPValues(condition, className);

                          return (
                            <TableCell
                              key={className}
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
                                    fontWeight: classMetrics.ap.mean === bestAP ? 'bold' : 'normal'
                                  }}
                                >
                                  {formatNumber(classMetrics.ap.mean, 4)} ± {formatNumber(classMetrics.ap.std, 4)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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

export default APMetricsTable;