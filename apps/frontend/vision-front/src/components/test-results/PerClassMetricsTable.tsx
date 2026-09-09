import React, { useMemo } from 'react';
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
import MetricCell from './MetricCell';
import { useTaxonomy } from '../../taxonomy/useTaxonomy';
import { discoverAggregateVocabulary } from './aggregateVocabulary';
import {
  type ComparisonData,
  type ConditionAggregates,
  DEFAULT_CLASS_METRICS,
  getBestValues
} from './performanceMetricsUtils';

interface PerClassMetricsTableProps {
  comparisonData: ComparisonData[];
  onGenerateLatex: () => void;
}

const PerClassMetricsTable: React.FC<PerClassMetricsTableProps> = ({
  comparisonData,
  onGenerateLatex
}) => {
  const theme = useTheme();

  const projectTaxonomy = useTaxonomy();
  const { taxonomy, conditions, classes, metrics } = useMemo(
    () => discoverAggregateVocabulary(comparisonData, projectTaxonomy, DEFAULT_CLASS_METRICS),
    [comparisonData, projectTaxonomy]
  );

  const formatNumber = (value: number | undefined, decimals: number = 4): string => {
    if (typeof value === 'number' && !isNaN(value)) {
      return value.toFixed(decimals);
    }
    return 'N/A';
  };

  if (comparisonData.length === 0) return null;

  const metricKeys = metrics.map(m => m.key);

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
      {conditions.map(condition => (
        <Box key={condition.key} sx={{ mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 2, ml: 2 }}>
            {condition.label} - Per-Class Metrics
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ borderBottom: '2px solid rgba(224, 224, 224, 1)' }}>
                    <strong>{condition.label.toUpperCase()}</strong>
                  </TableCell>
                  {comparisonData.map((comp) => (
                    <TableCell
                      key={comp.training._id}
                      colSpan={metrics.length}
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
                      {metrics.map((metric, index) => (
                        <TableCell
                          key={metric.key}
                          align="center"
                          sx={{
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            ...(index === metrics.length - 1
                              ? { borderRight: '2px solid rgba(224, 224, 224, 1)' }
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
                {classes.map((className) => (
                  <TableRow key={className.key}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {className.label}
                    </TableCell>
                    {comparisonData.map((comp) => {
                      const conditionData = comp.aggregatedResults?.[condition.key] as ConditionAggregates | undefined;
                      const classMetrics = conditionData?.[className.key];
                      const bestValues = getBestValues(
                        comparisonData,
                        condition.key,
                        className.key,
                        taxonomy,
                        metricKeys
                      );

                      return (
                        <React.Fragment key={comp.training._id}>
                          {metrics.map((metric, index) => {
                            const stat = classMetrics?.[metric.key];
                            return (
                              <MetricCell
                                key={metric.key}
                                value={stat?.mean}
                                // mean ± std, the shape this table has always shown
                                format={mean => `${formatNumber(mean, 2)} ± ${formatNumber(stat?.std, 2)}`}
                                best={stat?.mean !== undefined && stat.mean === bestValues[metric.key]}
                                borderRight={
                                  index === metrics.length - 1
                                    ? '2px solid rgba(224, 224, 224, 1)'
                                    : undefined
                                }
                              />
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      ))}
    </Paper>
  );
};

export default PerClassMetricsTable;
