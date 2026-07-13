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
import type { ComparisonData, ConditionAggregates } from './performanceMetricsUtils';

interface PerClassMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex: () => void;
}

const PerClassMetricsTable: React.FC<PerClassMetricsTableProps> = ({
  comparisonData,
  onGenerateLatex
}) => {
  const theme = useTheme();

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Helper function to find the best (maximum) value for each metric across all trainings
  const getBestValues = (condition: string, className: string) => {
    const bestValues: { [key: string]: number } = {};
    
    comparisonData.forEach((comp) => {
      const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
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
          <Typography variant="h6" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Per-Class Metrics Comparison
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
      </Box>
      {['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'].map(condition => (
        <Box key={condition} sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 2, textTransform: 'capitalize', ml: 2 }}>
            {condition.replace('_', ' ')} - Per-Class Metrics
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                    <strong>{condition.replace('_', ' ').toUpperCase()}</strong>
                  </TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell
                      key={comp.training._id}
                      colSpan={5}
                      align="center"
                      sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}
                    >
                      <Box>
                        <Link 
                          to={`/trainings/${comp.training._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                            {comp.training.name}
                          </Typography>
                        </Link>
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Class
                  </TableCell>
                  {comparisonData.map((comp) => (
                    <React.Fragment key={comp.training._id}>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>F1</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem', borderRight: '2px solid rgba(224, 224, 224, 1)' }}>AP</TableCell>
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {classNames.map((className) => {
                  return (
                    <TableRow key={className}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {className.charAt(0).toUpperCase() + className.slice(1)}
                      </TableCell>
                      {comparisonData.map((comp) => {
                        const conditionData = comp.aggregatedResults?.[condition] as ConditionAggregates | undefined;
                        const classMetrics = conditionData?.[className];
                        const bestValues = getBestValues(condition, className);

                        return (
                          <React.Fragment key={comp.training._id}>
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
                                  {formatNumber(classMetrics.precision.mean, 2)} ± {formatNumber(classMetrics.precision.std, 2)}
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
                                  {formatNumber(classMetrics.recall.mean, 2)} ± {formatNumber(classMetrics.recall.std, 2)}
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
                                  {formatNumber(classMetrics.f1_score.mean, 2)} ± {formatNumber(classMetrics.f1_score.std, 2)}
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
                            <TableCell align="center" sx={{ borderRight: '2px solid rgba(224, 224, 224, 1)' }}>
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
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}
    </Paper>
  );
};

export default PerClassMetricsTable;