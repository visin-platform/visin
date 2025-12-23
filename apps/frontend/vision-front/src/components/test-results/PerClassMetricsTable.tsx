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

interface PerClassMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex: () => void;
}

const PerClassMetricsTable: React.FC<PerClassMetricsTableProps> = ({
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
          No per-class metrics available
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
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                    <strong>{condition.replace('_', ' ').toUpperCase()}</strong>
                  </TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell
                      key={comp.testResult._id}
                      colSpan={5}
                      align="center"
                      sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}
                    >
                      <Box>
                        <Link 
                          to={`/trainings/${comp.training?._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                            {comp.training?.name || 'Unknown Training'}
                          </Typography>
                        </Link>
                        <Typography variant="caption" color="text.secondary">
                          Test {comp.testResult.test_uuid.slice(-8)} (Epoch {comp.testResult.epoch})
                        </Typography>
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    Class
                  </TableCell>
                  {comparisonData.map((comp) => (
                    <React.Fragment key={comp.testResult._id}>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>IoU</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Precision</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>Recall</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>AP</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.875rem', borderRight: '2px solid rgba(224, 224, 224, 1)' }}>F1</TableCell>
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {classNames.map((className) => {
                  // Calculate max values
                  const maxValues = {
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
                    })),
                    f1: Math.max(...comparisonData.map(comp => {
                      const conditionData = comp.test_results[condition];
                      const classMetrics = conditionData?.[className];
                      const f1Value = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;
                      return (f1Value !== undefined && f1Value !== null && !isNaN(f1Value)) ? f1Value : -Infinity;
                    }))
                  };

                  return (
                    <TableRow key={className}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {className.charAt(0).toUpperCase() + className.slice(1)}
                      </TableCell>
                      {comparisonData.map((comp) => {
                        const conditionData = comp.test_results[condition];
                        const classMetrics = conditionData?.[className];

                        return (
                          <React.Fragment key={comp.testResult._id}>
                            <TableCell align="center">
                              {classMetrics?.iou !== undefined ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: classMetrics.iou === maxValues.iou ? 700 : 'normal',
                                    opacity: classMetrics.iou === maxValues.iou ? 1 : 0.8
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
                                    fontWeight: classMetrics.precision === maxValues.precision ? 700 : 'normal'
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
                                    fontWeight: classMetrics.recall === maxValues.recall ? 700 : 'normal'
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
                            <TableCell align="center">
                              {classMetrics?.ap !== undefined ? (
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: classMetrics.ap === maxValues.ap ? 700 : 'normal'
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
                            <TableCell align="center" sx={{ borderRight: '2px solid rgba(224, 224, 224, 1)' }}>
                              {(() => {
                                const f1Value = classMetrics?.f1_score ?? classMetrics?.f1 ?? classMetrics?.mean_f1;
                                return f1Value !== undefined && f1Value !== null && !isNaN(f1Value) ? (
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: f1Value === maxValues.f1 ? 700 : 'normal'
                                    }}
                                  >
                                    {formatNumber(f1Value)}
                                  </Typography>
                                ) : (
                                  <Typography variant="body2" color="text.secondary">
                                    N/A
                                  </Typography>
                                );
                              })()}
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