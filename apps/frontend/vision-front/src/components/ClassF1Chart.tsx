import React from 'react';
import { Paper, Box } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

interface ClassF1ChartProps {
  epochs: Epoch[];
}

const ClassF1Chart: React.FC<ClassF1ChartProps> = ({ 
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
      if (!EXCLUDED_KEYS.has(key) && valResults[key]?.f1 !== undefined) {
        allClasses.add(key);
      }
    });

    // If no classes found in val, try train
    if (allClasses.size === 0) {
      const trainResults = epoch.results?.train as Record<string, any> || {};
      Object.keys(trainResults).forEach(key => {
        if (!EXCLUDED_KEYS.has(key) && trainResults[key]?.f1 !== undefined) {
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
        if (perClass[key]?.f1 !== undefined) {
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
      const classF1Data = epochs.map(epoch => {
        // Try validation results first
        let valResults = epoch.results?.val as Record<string, any> || {};
        let f1Value = valResults[className]?.f1;

        // Try training results if val doesn't have it
        if (f1Value === undefined) {
          const trainResults = epoch.results?.train as Record<string, any> || {};
          f1Value = trainResults[className]?.f1;
        }

        // Try per_class structures as fallback
        if (f1Value === undefined) {
          let perClass = epoch.results?.val?.per_class as Record<string, any> || {};
          f1Value = perClass[className]?.f1;
        }

        if (f1Value === undefined) {
          let perClass = epoch.results?.train?.per_class as Record<string, any> || {};
          f1Value = perClass[className]?.f1;
        }

        if (f1Value === undefined) {
          let perClass = epoch.results?.metrics?.per_class as Record<string, any> || {};
          f1Value = perClass[className]?.f1;
        }

        return f1Value ?? null;
      });

      return {
        data: classF1Data,
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
                  direction: 'column' as const,
                  position: { vertical: 'top' as const, horizontal: 'right' as const },
                  padding: 10
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
                  direction: 'column' as const,
                  position: { vertical: 'top' as const, horizontal: 'right' as const },
                  padding: 10
                }
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default ClassF1Chart;