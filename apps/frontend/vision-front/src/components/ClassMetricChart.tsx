import React from 'react';
import { Box, Paper } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

export type ClassMetric = 'iou' | 'precision' | 'recall' | 'f1' | 'ap';

interface ClassMetricChartProps {
  epochs: Epoch[];
  metric: ClassMetric;
  emptyState?: React.ReactNode;
  labelFormatter?: (className: string) => string;
  includeZeroValues?: boolean;
}

type MetricRecord = Record<string, unknown>;

const EXCLUDED_KEYS = new Set(['loss', 'mean_iou', 'learning_rate', 'epoch_time', 'timestamp', 'per_class']);

const COLORS = [
  '#1976d2',
  '#d32f2f',
  '#f57c00',
  '#388e3c',
  '#7b1fa2',
  '#00796b',
  '#c2185b',
  '#0097a7',
  '#fbc02d',
  '#6a1b9a'
];

const isRecord = (value: unknown): value is MetricRecord =>
  typeof value === 'object' && value !== null;

const getConditionResults = (epoch: Epoch, key: 'val' | 'train' | 'metrics'): MetricRecord => {
  const value = epoch.results?.[key];
  return isRecord(value) ? value : {};
};

const getPerClassResults = (conditionResults: MetricRecord): MetricRecord => {
  const value = conditionResults.per_class;
  return isRecord(value) ? value : {};
};

const getMetricValue = (entry: unknown, metric: ClassMetric): number | undefined => {
  if (!isRecord(entry)) {
    return undefined;
  }

  const value = entry[metric];
  if (typeof value === 'number') {
    return value;
  }

  if (metric === 'ap' && isRecord(value) && typeof value.mean === 'number') {
    return value.mean;
  }

  return undefined;
};

const addClassesWithMetric = (classes: Set<string>, results: MetricRecord, metric: ClassMetric) => {
  Object.entries(results).forEach(([className, entry]) => {
    if (!EXCLUDED_KEYS.has(className) && getMetricValue(entry, metric) !== undefined) {
      classes.add(className);
    }
  });
};

const findMetricValue = (epoch: Epoch, className: string, metric: ClassMetric): number | null => {
  const valResults = getConditionResults(epoch, 'val');
  const trainResults = getConditionResults(epoch, 'train');
  const metricsResults = getConditionResults(epoch, 'metrics');

  const candidates = [
    valResults[className],
    trainResults[className],
    metricsResults[className],
    getPerClassResults(valResults)[className],
    getPerClassResults(trainResults)[className],
    getPerClassResults(metricsResults)[className]
  ];

  for (const candidate of candidates) {
    const value = getMetricValue(candidate, metric);
    if (value !== undefined) {
      return value;
    }
  }

  return null;
};

const hasSeriesData = (
  series: { data: (number | null)[] }[],
  includeZeroValues: boolean
) =>
  series.some((item) =>
    item.data.some((value) => value !== null && (includeZeroValues || value !== 0))
  );

const ClassMetricChart: React.FC<ClassMetricChartProps> = ({
  epochs,
  metric,
  emptyState = null,
  labelFormatter = (className) => className,
  includeZeroValues = false
}) => {
  if (epochs.length === 0) {
    return null;
  }

  const allClasses = new Set<string>();
  epochs.forEach((epoch) => {
    const valResults = getConditionResults(epoch, 'val');
    const trainResults = getConditionResults(epoch, 'train');
    const metricsResults = getConditionResults(epoch, 'metrics');

    [valResults, trainResults, metricsResults].forEach((results) => {
      addClassesWithMetric(allClasses, results, metric);
      addClassesWithMetric(allClasses, getPerClassResults(results), metric);
    });
  });

  if (allClasses.size === 0) {
    return emptyState;
  }

  const classesArray = Array.from(allClasses).sort();
  const regularClasses = classesArray.filter((className) => !className.endsWith('_2d'));
  const twoDClasses = classesArray.filter((className) => className.endsWith('_2d'));
  const epochNumbers = epochs.map((epoch) => epoch.epoch);

  const createChartSeries = (classList: string[]) =>
    classList.map((className, index) => ({
      data: epochs.map((epoch) => findMetricValue(epoch, className, metric)),
      label: labelFormatter(className),
      color: COLORS[index % COLORS.length],
      showMark: false
    }));

  const regularSeries = createChartSeries(regularClasses);
  const twoDSeries = createChartSeries(twoDClasses);
  const hasRegularData = hasSeriesData(regularSeries, includeZeroValues);
  const hasTwoDData = hasSeriesData(twoDSeries, includeZeroValues);

  if (!hasRegularData && !hasTwoDData) {
    return null;
  }

  const renderChart = (series: typeof regularSeries) => (
    <Paper sx={{ p: 3, position: 'relative' }}>
      <Box sx={{ width: '100%', height: 400 }}>
        <LineChart
          xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
          series={series}
          margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
          slotProps={{
            legend: {
              direction: 'vertical' as const,
              position: { vertical: 'top' as const, horizontal: 'end' as const },
            }
          }}
        />
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {hasRegularData && renderChart(regularSeries)}
      {hasTwoDData && renderChart(twoDSeries)}
    </Box>
  );
};

export default ClassMetricChart;
