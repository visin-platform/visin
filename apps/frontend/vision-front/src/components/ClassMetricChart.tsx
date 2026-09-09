import React from 'react';
import { Box, Paper } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';
import { discoverEpochClasses, readMetric } from '../taxonomy/discover';
import { useTaxonomy } from '../taxonomy/useTaxonomy';
import { PALETTE } from '../taxonomy/resolveTaxonomy';

export type ClassMetric = 'iou' | 'precision' | 'recall' | 'f1' | 'ap';

interface ClassMetricChartProps {
  epochs: Epoch[];
  metric: ClassMetric;
  emptyState?: React.ReactNode;
  labelFormatter?: (className: string) => string;
  includeZeroValues?: boolean;
}

const findMetricValue = (epoch: Epoch, className: string, metric: ClassMetric): number | null => {
  const sections = ['val', 'train', 'metrics'] as const;
  for (const section of sections) {
    const block = epoch.results?.[section] as Record<string, unknown> | undefined;
    if (!block) {
      continue;
    }
    const perClass = block.per_class as Record<string, unknown> | undefined;
    for (const candidate of [block[className], perClass?.[className]]) {
      const value = readMetric(candidate, metric);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return null;
};

const hasSeriesData = (series: { data: (number | null)[] }[], includeZeroValues: boolean) =>
  series.some(item =>
    item.data.some(value => value !== null && (includeZeroValues || value !== 0))
  );

const ClassMetricChart: React.FC<ClassMetricChartProps> = ({
  epochs,
  metric,
  emptyState = null,
  labelFormatter,
  includeZeroValues = false
}) => {
  const taxonomy = useTaxonomy();

  if (epochs.length === 0) {
    return null;
  }

  const classesArray = discoverEpochClasses(epochs, metric).sort();

  if (classesArray.length === 0) {
    return emptyState;
  }

  // A `_2d` suffix marks a projection of the same class onto the image plane; its
  // values live on a different scale, so those series get their own chart.
  const regularClasses = classesArray.filter(className => !className.endsWith('_2d'));
  const twoDClasses = classesArray.filter(className => className.endsWith('_2d'));
  const epochNumbers = epochs.map(epoch => epoch.epoch);

  // A project-configured colour/label wins; otherwise fall back to the palette so
  // an unconfigured class still gets a stable, distinct series.
  const termFor = (className: string) => taxonomy.classes.find(c => c.key === className);
  const labelFor = (className: string) =>
    labelFormatter ? labelFormatter(className) : taxonomy.classLabel(className);

  const createChartSeries = (classList: string[]) =>
    classList.map((className, index) => ({
      data: epochs.map(epoch => findMetricValue(epoch, className, metric)),
      label: labelFor(className),
      color: termFor(className)?.color ?? PALETTE[index % PALETTE.length],
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
