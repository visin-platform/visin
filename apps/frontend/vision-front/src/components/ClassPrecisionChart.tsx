import React from 'react';
import { Paper, Box } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

interface ClassPrecisionChartProps {
  epochs: Epoch[];
}

const ClassPrecisionChart: React.FC<ClassPrecisionChartProps> = ({ 
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
    const valResults = epoch.results?.val as Record<string, any> || {};
    Object.keys(valResults).forEach(key => {
      if (!EXCLUDED_KEYS.has(key) && valResults[key]?.precision !== undefined) {
        allClasses.add(key);
      }
    });

    // If no classes found in val, try train
    if (allClasses.size === 0) {
      const trainResults = epoch.results?.train as Record<string, any> || {};
      Object.keys(trainResults).forEach(key => {
        if (!EXCLUDED_KEYS.has(key) && trainResults[key]?.precision !== undefined) {
          allClasses.add(key);
        }
      });
    }

    // Try per_class structure as fallback
    if (allClasses.size === 0) {
      let perClass = epoch.results?.val?.per_class as Record<string, any> || {};
      if (Object.keys(perClass).length === 0) {
        perClass = epoch.results?.train?.per_class as Record<string, any> || {};
      }
      if (Object.keys(perClass).length === 0) {
        perClass = epoch.results?.metrics?.per_class as Record<string, any> || {};
      }
      Object.keys(perClass).forEach(key => {
        if (perClass[key]?.precision !== undefined) {
          allClasses.add(key);
        }
      });
    }
  });

  if (allClasses.size === 0) {
    return null;
  }

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
      const classPrecisionData = epochs.map(epoch => {
        // Try validation results first
        const valResults = epoch.results?.val as Record<string, any> || {};
        let precisionValue = valResults[className]?.precision;

        // Try training results if val doesn't have it
        if (precisionValue === undefined) {
          const trainResults = epoch.results?.train as Record<string, any> || {};
          precisionValue = trainResults[className]?.precision;
        }

        // Try per_class structures as fallback
        if (precisionValue === undefined) {
          const perClass = epoch.results?.val?.per_class as Record<string, any> || {};
          precisionValue = perClass[className]?.precision;
        }

        if (precisionValue === undefined) {
          const perClass = epoch.results?.train?.per_class as Record<string, any> || {};
          precisionValue = perClass[className]?.precision;
        }

        if (precisionValue === undefined) {
          const perClass = epoch.results?.metrics?.per_class as Record<string, any> || {};
          precisionValue = perClass[className]?.precision;
        }

        return precisionValue ?? null;
      });

      return {
        data: classPrecisionData,
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

export default ClassPrecisionChart;