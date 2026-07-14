import React from 'react';
import {
  Paper,
  Box,
  Typography,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  alpha,
  useTheme
} from '@mui/material';
import { Link } from 'react-router-dom';
import { TrainingComparison } from '../../types';

interface MetricStat {
  mean: number;
  std: number;
}

interface TrainingMetricsTableProps {
  comparisonData: TrainingComparison[];
}

const TrainingMetricsTable: React.FC<TrainingMetricsTableProps> = ({ comparisonData }) => {
  const theme = useTheme();

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Filter trainings that have aggregated test results
  const trainingsWithMetrics = comparisonData.filter(comp => comp.aggregatedTestResults !== null);

  if (trainingsWithMetrics.length === 0) {
    return (
      <Paper
        sx={{
          mb: 4,
          boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.2)}`,
          bgcolor: alpha(theme.palette.primary.main, 0.05),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`
        }}
      >
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom sx={{
            color: "text.secondary"
          }}>
            No Test Results Available
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Test results metrics will appear here once trainings have completed testing
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Get all available conditions and classes
  const conditions = ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'];
  const classes = ['human', 'sign', 'vehicle'];

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
          Performance Metrics Summary
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 2
          }}>
          Key metrics from test results across different conditions and classes
        </Typography>
      </Box>
      {conditions.map(condition => (
        <Box key={condition} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ px: 3, mb: 1, fontWeight: 600 }}>
            {condition.replace('_', ' ').toUpperCase()}
          </Typography>
          <TableContainer component={Paper} sx={{ mx: 3, mb: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ fontWeight: 600, minWidth: 150 }}>Training</TableCell>
                  {classes.map(className => (
                    <TableCell
                      key={className}
                      colSpan={4}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        borderRight: classes.indexOf(className) < classes.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                      }}
                    >
                      {className.charAt(0).toUpperCase() + className.slice(1)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ fontWeight: 600 }}></TableCell>
                  {classes.map(className => (
                    <React.Fragment key={className}>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>IoU</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Prec</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600, fontSize: '0.75rem' }}>Rec</TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          borderRight: classes.indexOf(className) < classes.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                        }}
                      >
                        F1
                      </TableCell>
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {trainingsWithMetrics.map((comp) => {
                  const conditionData = comp.aggregatedTestResults?.[condition] as Record<string, Record<string, MetricStat>> | undefined;
                  return (
                    <TableRow key={comp.training._id} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                      <TableCell sx={{ fontWeight: 600, minWidth: 150 }}>
                        <Link
                          to={`/trainings/${comp.training._id}`}
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 600, display: 'inline' }}>
                            {comp.training.name}
                          </Typography>
                        </Link>
                      </TableCell>
                      {classes.map((className) => {
                        const classMetrics = conditionData?.[className];
                        return (
                          <React.Fragment key={className}>
                            <TableCell align="center">
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {classMetrics?.iou?.mean !== undefined ? formatNumber(classMetrics.iou.mean, 3) : 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {classMetrics?.precision?.mean !== undefined ? formatNumber(classMetrics.precision.mean, 3) : 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {classMetrics?.recall?.mean !== undefined ? formatNumber(classMetrics.recall.mean, 3) : 'N/A'}
                              </Typography>
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{
                                borderRight: classes.indexOf(className) < classes.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                              }}
                            >
                              <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                {classMetrics?.f1_score?.mean !== undefined ? formatNumber(classMetrics.f1_score.mean, 3) : 'N/A'}
                              </Typography>
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

export default TrainingMetricsTable;
