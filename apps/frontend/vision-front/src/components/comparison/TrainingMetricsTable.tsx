import React, { useMemo } from 'react';
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
import { useTaxonomy } from '../../taxonomy/useTaxonomy';
import { discoverAggregateVocabulary } from '../test-results/aggregateVocabulary';
import type { ComparisonData } from '../test-results/performanceMetricsUtils';

interface MetricStat {
  mean: number;
  std: number;
}

/** The four columns this summary shows per class, where a run reports them. */
const SUMMARY_METRICS = ['iou', 'precision', 'recall', 'f1_score'];

interface TrainingMetricsTableProps {
  comparisonData: TrainingComparison[];
}

const TrainingMetricsTable: React.FC<TrainingMetricsTableProps> = ({ comparisonData }) => {
  const theme = useTheme();
  const projectTaxonomy = useTaxonomy();

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  // Filter trainings that have aggregated test results
  const trainingsWithMetrics = comparisonData.filter(comp => comp.aggregatedTestResults !== null);

  const { conditions, classes, metrics } = useMemo(
    () =>
      discoverAggregateVocabulary(
        trainingsWithMetrics.map(comp => ({
          aggregatedResults: comp.aggregatedTestResults,
          training: comp.training,
          testResultsCount: comp.testResultsCount || 0
        })) as ComparisonData[],
        projectTaxonomy,
        SUMMARY_METRICS
      ),
    [trainingsWithMetrics, projectTaxonomy]
  );

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
          Key metrics from test results across {projectTaxonomy.conditionLabel.toLowerCase()}s and classes
        </Typography>
      </Box>
      {conditions.map(condition => (
        <Box key={condition.key} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ px: 3, mb: 1, fontWeight: 600 }}>
            {condition.label.toUpperCase()}
          </Typography>
          <TableContainer component={Paper} sx={{ mx: 3, mb: 2, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ fontWeight: 600, minWidth: 150 }}>Training</TableCell>
                  {classes.map((className, classIndex) => (
                    <TableCell
                      key={className.key}
                      colSpan={metrics.length}
                      align="center"
                      sx={{
                        fontWeight: 600,
                        borderRight: classIndex < classes.length - 1 ? '1px solid rgba(224, 224, 224, 1)' : 'none'
                      }}
                    >
                      {className.label}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ bgcolor: 'background.default' }}>
                  <TableCell sx={{ fontWeight: 600 }}></TableCell>
                  {classes.map((className, classIndex) => (
                    <React.Fragment key={className.key}>
                      {metrics.map((metric, metricIndex) => (
                        <TableCell
                          key={metric.key}
                          align="center"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            ...(metricIndex === metrics.length - 1 && classIndex < classes.length - 1
                              ? { borderRight: '1px solid rgba(224, 224, 224, 1)' }
                              : {})
                          }}
                        >
                          {metric.label}
                        </TableCell>
                      ))}
                    </React.Fragment>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {trainingsWithMetrics.map((comp) => {
                  const conditionData = comp.aggregatedTestResults?.[condition.key] as Record<string, Record<string, MetricStat>> | undefined;
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
                      {classes.map((className, classIndex) => {
                        const classMetrics = conditionData?.[className.key];
                        return (
                          <React.Fragment key={className.key}>
                            {metrics.map((metric, metricIndex) => (
                              <TableCell
                                key={metric.key}
                                align="center"
                                sx={
                                  metricIndex === metrics.length - 1 && classIndex < classes.length - 1
                                    ? { borderRight: '1px solid rgba(224, 224, 224, 1)' }
                                    : undefined
                                }
                              >
                                <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                                  {formatNumber(classMetrics?.[metric.key]?.mean, 3)}
                                </Typography>
                              </TableCell>
                            ))}
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
