import React from 'react';
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

interface ComparisonData {
  aggregatedResults: any;
  training: { _id: string; name: string };
  testResultsCount: number;
}

interface PerformanceMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex: () => void;
}

const PerformanceMetricsTable: React.FC<PerformanceMetricsTableProps> = ({
  comparisonData,
  onGenerateLatex
}) => {
  const theme = useTheme();

  const formatNumber = (value: any, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Performance Metrics Comparison
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<CodeIcon />}
            onClick={onGenerateLatex}
            disabled={comparisonData.length === 0}
          >
            LaTeX
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Comparing test results across different conditions and classes
        </Typography>
      </Box>

      {['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => {
        return (
          <TableContainer key={condition} component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
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
                        borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                      }}
                    >
                      {className.charAt(0).toUpperCase() + className.slice(1)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)' }}>
                    {condition.replace('_', ' ').toUpperCase()}
                  </TableCell>
                  {classNames.map((className) => (
                    <React.Fragment key={className}>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>F1</TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          borderRight: classNames.indexOf(className) < classNames.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                        }}
                      >
                        AP
                      </TableCell>
                    </React.Fragment>
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
                                  {formatNumber(classMetrics.iou.mean, 2)} ± {formatNumber(classMetrics.iou.std, 2)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
                                  {formatNumber(classMetrics.precision.mean, 2)} ± {formatNumber(classMetrics.precision.std, 2)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
                                  {formatNumber(classMetrics.recall.mean, 2)} ± {formatNumber(classMetrics.recall.std, 2)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
                                  {formatNumber(classMetrics.f1_score.mean, 2)} ± {formatNumber(classMetrics.f1_score.std, 2)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
                                  {formatNumber(classMetrics.ap.mean, 2)} ± {formatNumber(classMetrics.ap.std, 2)}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          </React.Fragment>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        );
      })}
    </Paper>
  );
};

export default PerformanceMetricsTable;