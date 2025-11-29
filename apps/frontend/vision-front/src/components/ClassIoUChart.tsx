import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch, Comment } from '../types';
import ChartComments from './ChartComments';

interface ClassIoUChartProps {
  epochs: Epoch[];
  trainingId?: string;
  comments?: Comment[];
  commentsLoading?: boolean;
  onCommentsRefetch?: () => void;
}

const ClassIoUChart: React.FC<ClassIoUChartProps> = ({ 
  epochs, 
  trainingId, 
  comments, 
  commentsLoading, 
  onCommentsRefetch 
}) => {
  if (epochs.length === 0) {
    return null;
  }

  // Extract all unique class names from all epochs
  // Support multiple data structures
  const allClasses = new Set<string>();
  const EXCLUDED_KEYS = new Set(['loss', 'mean_iou', 'learning_rate', 'epoch_time', 'timestamp']);

  epochs.forEach(epoch => {
    // Try validation results first
    const valResults = epoch.results?.val as Record<string, any> || {};
    Object.keys(valResults).forEach(key => {
      if (!EXCLUDED_KEYS.has(key) && valResults[key]?.iou !== undefined) {
        allClasses.add(key);
      }
    });

    // If no classes found in val, try train
    if (allClasses.size === 0) {
      const trainResults = epoch.results?.train as Record<string, any> || {};
      Object.keys(trainResults).forEach(key => {
        if (!EXCLUDED_KEYS.has(key) && trainResults[key]?.iou !== undefined) {
          allClasses.add(key);
        }
      });
    }

    // Try per_class structure
    if (allClasses.size === 0) {
      let perClass = epoch.results?.val?.per_class as Record<string, any> || {};
      if (Object.keys(perClass).length === 0) {
        perClass = epoch.results?.train?.per_class as Record<string, any> || {};
      }
      if (Object.keys(perClass).length === 0) {
        perClass = epoch.results?.metrics?.per_class as Record<string, any> || {};
      }
      Object.keys(perClass).forEach(key => allClasses.add(key));
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
      const classIoUData = epochs.map(epoch => {
        // Try validation results first
        let valResults = epoch.results?.val as Record<string, any> || {};
        let iouValue = valResults[className]?.iou;

        // Try training results if val doesn't have it
        if (iouValue === undefined) {
          const trainResults = epoch.results?.train as Record<string, any> || {};
          iouValue = trainResults[className]?.iou;
        }

        // Try per_class structures
        if (iouValue === undefined) {
          let perClass = epoch.results?.val?.per_class as Record<string, any> || {};
          iouValue = perClass[className]?.iou;
        }

        if (iouValue === undefined) {
          let perClass = epoch.results?.train?.per_class as Record<string, any> || {};
          iouValue = perClass[className]?.iou;
        }

        if (iouValue === undefined) {
          let perClass = epoch.results?.metrics?.per_class as Record<string, any> || {};
          iouValue = perClass[className]?.iou;
        }

        return iouValue ?? null;
      });

      return {
        data: classIoUData,
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
          <Typography variant="h6" gutterBottom>
            IoU Over Epochs (Validation Data)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Per-class Intersection over Union (IoU) metrics tracked across training epochs. Background class is ignored and excluded from calculations.
          </Typography>
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
          {trainingId && (
            <ChartComments 
              trainingId={trainingId} 
              section="class_iou_chart" 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          )}
        </Paper>
      )}

      {/* 2D Classes Chart */}
      {hasTwoDData && (
        <Paper sx={{ p: 3, position: 'relative' }}>
          <Typography variant="h6" gutterBottom>
            Class IoU Over Epochs (2D Validation Data)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Per-class Intersection over Union (IoU) metrics for 2D projections tracked across training epochs. Background class is ignored and excluded from calculations.
          </Typography>
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
          {trainingId && (
            <ChartComments 
              trainingId={trainingId} 
              section="class_iou_2d_chart" 
              comments={comments}
              commentsLoading={commentsLoading}
              onCommentsRefetch={onCommentsRefetch}
            />
          )}
        </Paper>
      )}
    </Box>
  );
};

export default ClassIoUChart;
