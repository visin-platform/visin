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
  test_results: any;
  training?: { _id: string; name: string };
  testResult: { _id: string; test_uuid: string; epoch: number };
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

  if (comparisonData.length === 0) return null;

  // Extract all unique class names
  const allClasses = new Set<string>();
  comparisonData.forEach(comp => {
    Object.values(comp.test_results).forEach((conditionData: any) => {
      if (conditionData && typeof conditionData === 'object') {
        Object.keys(conditionData).forEach(className => {
          if (className !== 'inference_time') {
            allClasses.add(className);
          }
        });
      }
    });
  });
  const classNames = Array.from(allClasses).sort();

  if (classNames.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No metrics available for comparison
        </Typography>
      </Box>
    );
  }

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
        // Calculate max values
        const maxValues: Record<string, { iou: number; precision: number; recall: number; ap: number }> = {};
        classNames.forEach(className => {
          maxValues[className] = {
            iou: Math.max(...comparisonData.map(comp => {
              const conditionData = comp.test_results[condition];
              const classMetrics = conditionData?.[className];
              return classMetrics?.iou ?? -Infinity;
            })),
            precision: Math.max(...comparisonData.map(comp => {
              const conditionData = comp.test_results[condition];
              const classMetrics = conditionData?.[className];
              return classMetrics?.precision ?? -Infinity;
            })),
            recall: Math.max(...comparisonData.map(comp => {
              const conditionData = comp.test_results[condition];
              const classMetrics = conditionData?.[className];
              return classMetrics?.recall ?? -Infinity;
            })),
            ap: Math.max(...comparisonData.map(comp => {
              const conditionData = comp.test_results[condition];
              const classMetrics = conditionData?.[className];
              return classMetrics?.ap ?? -Infinity;
            }))
          };
        });

        return (
          <TableContainer key={condition} component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 120 }}>
                    Test Result
                  </TableCell>
                  {classNames.map((className) => (
                    <TableCell
                      key={className}
                      colSpan={4}
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
                {comparisonData.map((comp) => (
                  <TableRow key={comp.testResult._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'grey.25' } }}>
                    <TableCell sx={{ fontWeight: 600, borderRight: '2px solid rgba(224, 224, 224, 1)', minWidth: 150 }}>
                      <Link 
                        to={`/trainings/${comp.training?._id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                          {comp.training?.name || 'Unknown Training'}
                        </Typography>
                      </Link>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'normal', display: 'inline', ml: 1 }}>
                        Test {comp.testResult.test_uuid.slice(-8)} (Epoch {comp.testResult.epoch})
                      </Typography>
                    </TableCell>
                    {classNames.map((className) => {
                      const conditionData = comp.test_results[condition];
                      const classMetrics = conditionData?.[className];

                      return (
                        <React.Fragment key={className}>
                          <TableCell align="center">
                            {classMetrics?.iou !== undefined ? (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: classMetrics.iou === maxValues[className].iou ? 700 : 'normal'
                                }}
                              >
                                {formatNumber(classMetrics.iou)}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                N/A
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {classMetrics?.precision !== undefined ? (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: classMetrics.precision === maxValues[className].precision ? 700 : 'normal'
                                }}
                              >
                                {formatNumber(classMetrics.precision)}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                N/A
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {classMetrics?.recall !== undefined ? (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: classMetrics.recall === maxValues[className].recall ? 700 : 'normal'
                                }}
                              >
                                {formatNumber(classMetrics.recall)}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
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
                            {classMetrics?.ap !== undefined ? (
                              <Typography
                                variant="body2"
                                sx={{
                                  fontWeight: classMetrics.ap === maxValues[className].ap ? 700 : 'normal'
                                }}
                              >
                                {formatNumber(classMetrics.ap)}
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                N/A
                              </Typography>
                            )}
                          </TableCell>
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        );
      })}
    </Paper>
  );
};

export default PerformanceMetricsTable;