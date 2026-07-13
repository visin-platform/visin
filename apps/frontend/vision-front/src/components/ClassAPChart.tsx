import React from 'react';
import { Paper, Box, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

// Unlike the other Class*Chart components, AP may come through either as a raw
// number (per-epoch training metrics) or as an aggregated {mean, std} stat
// (test-result comparisons).
interface APMetric {
  ap?: number | { mean: number; std: number };
}

/** Unwraps an aggregated {mean, std} stat down to its mean, passing raw numbers through. */
const toApNumber = (value: number | { mean: number; std: number } | undefined): number | undefined =>
  typeof value === 'object' ? value.mean : value;

interface ClassAPChartProps {
  epochs: Epoch[];
}

const ClassAPChart: React.FC<ClassAPChartProps> = ({
  epochs
}) => {
  if (epochs.length === 0) {
    return null;
  }

  // Extract all unique class names from all epochs
  const allClasses = new Set<string>();
  const EXCLUDED_KEYS = new Set(['loss', 'mean_iou', 'learning_rate', 'epoch_time', 'timestamp']);

  epochs.forEach(epoch => {
    // Try validation results first
    const valResults = (epoch.results?.val || {}) as Record<string, APMetric>;
    Object.keys(valResults).forEach(key => {
      if (!EXCLUDED_KEYS.has(key) && toApNumber(valResults[key]?.ap) !== undefined) {
        allClasses.add(key);
      }
    });

    // If no classes found in val, try train
    if (allClasses.size === 0) {
      const trainResults = (epoch.results?.train || {}) as Record<string, APMetric>;
      Object.keys(trainResults).forEach(key => {
        if (!EXCLUDED_KEYS.has(key) && toApNumber(trainResults[key]?.ap) !== undefined) {
          allClasses.add(key);
        }
      });
    }

    // Try per_class structure as fallback
    if (allClasses.size === 0) {
      let perClass = (epoch.results?.val?.per_class || {}) as Record<string, APMetric>;
      if (Object.keys(perClass).length === 0) {
        perClass = (epoch.results?.train?.per_class || {}) as Record<string, APMetric>;
      }
      if (Object.keys(perClass).length === 0) {
        perClass = (epoch.results?.metrics?.per_class || {}) as Record<string, APMetric>;
      }
      Object.keys(perClass).forEach(key => {
        if (toApNumber(perClass[key]?.ap) !== undefined) {
          allClasses.add(key);
        }
      });
    }
  });

  if (allClasses.size === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          Average Precision (AP) is not calculated during training epochs.
          AP metrics are available in test results.
        </Typography>
      </Box>
    );
  }

  console.log('ClassAPChart - Found classes:', Array.from(allClasses));

  // Separate classes into regular and _2d groups
  const classesArray = Array.from(allClasses).sort();
  const regularClasses = classesArray.filter(className => !className.endsWith('_2d'));
  const twoDClasses = classesArray.filter(className => className.endsWith('_2d'));

  // Color palette for classes
  const colors = [
    '#1976d2', // blue
    '#d32f2f', // red
    '#f57c00', // orange
    '#388e3c', // green
    '#7b1fa2', // purple
    '#00796b', // teal
    '#c2185b', // pink
    '#0097a7', // cyan
    '#fbc02d', // yellow
    '#6a1b9a'  // deep purple
  ];

  const epochNumbers = epochs.map(e => e.epoch);

  // Helper function to create chart series for a class group
  const createChartSeries = (classList: string[]) => {
    return classList.map((className, index) => {
      const classAPData = epochs.map(epoch => {
        // Try validation results first
        const valResults = (epoch.results?.val || {}) as Record<string, APMetric>;
        let apValue = toApNumber(valResults[className]?.ap);

        // Try training results if val doesn't have it
        if (apValue === undefined) {
          const trainResults = (epoch.results?.train || {}) as Record<string, APMetric>;
          apValue = toApNumber(trainResults[className]?.ap);
        }

        // Try per_class structures as fallback
        if (apValue === undefined) {
          const perClass = (epoch.results?.val?.per_class || {}) as Record<string, APMetric>;
          apValue = toApNumber(perClass[className]?.ap);
        }

        if (apValue === undefined) {
          const perClass = (epoch.results?.train?.per_class || {}) as Record<string, APMetric>;
          apValue = toApNumber(perClass[className]?.ap);
        }

        if (apValue === undefined) {
          const perClass = (epoch.results?.metrics?.per_class || {}) as Record<string, APMetric>;
          apValue = toApNumber(perClass[className]?.ap);
        }

        return apValue ?? null;
      });

      return {
        data: classAPData,
        label: className,
        color: colors[index % colors.length],
        showMark: false,
      };
    });
  };

  // Create series for both groups
  const regularSeries = createChartSeries(regularClasses);
  const twoDSeries = createChartSeries(twoDClasses);

  // Check if we have data for each group
  const hasRegularData = regularSeries.some(s => s.data.some(v => v !== null && v !== 0));
  const hasTwoDData = twoDSeries.some(s => s.data.some(v => v !== null && v !== 0));

  // If no data at all, return null
  if (!hasRegularData && !hasTwoDData) {
    return null;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Regular Classes Chart */}
      {hasRegularData && (
        <Paper sx={{ p: 3, position: 'relative' }}>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={regularSeries}
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
      )}

      {/* 2D Classes Chart */}
      {hasTwoDData && (
        <Paper sx={{ p: 3, position: 'relative' }}>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={twoDSeries}
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
      )}
    </Box>
  );
};

export default ClassAPChart;