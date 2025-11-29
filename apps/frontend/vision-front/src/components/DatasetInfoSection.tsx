import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Divider,
  Typography,
  Paper
} from '@mui/material';
import { BarChart } from '@mui/x-charts';
import { Training } from '../types';

interface DatasetInfoSectionProps {
  training: Training;
}

export const DatasetInfoSection: React.FC<DatasetInfoSectionProps> = ({ training }) => {
  if (!training.metadata?.dataset_info) {
    return null;
  }

  const datasetInfo = training.metadata.dataset_info;
  const classes = datasetInfo.segmentation_statistics?.classes;
  const classNames = classes ? Object.values(classes).map((cls: any) => cls.name || 'Unknown') : [];
  const pixelData = classes ? Object.values(classes).map((cls: any) => cls.total_pixels || 0) : [];
  const frameData = classes ? Object.values(classes).map((cls: any) => cls.frames_with_class || 0) : [];

  // Calculate percentages
  const totalFrames = datasetInfo.dataset_overview?.total_frames || 1;
  const totalPixels = datasetInfo.dataset_overview?.total_pixels || 1;

  const datasetSplitPercentages = datasetInfo.dataset_splits ? [
    ((datasetInfo.dataset_splits.train_frames || 0) / totalFrames * 100).toFixed(1),
    ((datasetInfo.dataset_splits.validation_frames || 0) / totalFrames * 100).toFixed(1),
    ((datasetInfo.dataset_splits.test_frames || 0) / totalFrames * 100).toFixed(1)
  ] : ['0.0', '0.0', '0.0'];

  const pixelPercentages = pixelData.map(pixels => ((pixels / totalPixels) * 100).toFixed(1));
  const framePercentages = frameData.map(frames => ((frames / totalFrames) * 100).toFixed(1));

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ mt: 4, mb: 3 }}>
        Dataset Information
      </Typography>

      {/* Dataset Overview Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Dataset Overview
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Dataset Name
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {datasetInfo.dataset_overview?.name || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Version
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {datasetInfo.dataset_overview?.version || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Total Frames
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {datasetInfo.dataset_overview?.total_frames?.toLocaleString() || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Classes
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {Object.keys(datasetInfo.dataset_overview?.classes || {}).length}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Dataset Charts Grid */}
      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }} gap={3} sx={{ mb: 3 }}>
        {/* Dataset Splits Chart */}
        {datasetInfo.dataset_splits && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Dataset Splits
            </Typography>
            <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
              <BarChart
                xAxis={[{ scaleType: 'band', data: ['Train', 'Validation', 'Test'] }]}
                series={[{
                  data: [
                    datasetInfo.dataset_splits.train_frames || 0,
                    datasetInfo.dataset_splits.validation_frames || 0,
                    datasetInfo.dataset_splits.test_frames || 0
                  ],
                  label: 'Frames',
                  color: '#1976d2',
                  valueFormatter: (value, context) => {
                    const percentage = datasetSplitPercentages[context.dataIndex];
                    return `${value?.toLocaleString() || 0} (${percentage}%)`;
                  }
                }]}
                margin={{ top: 20, bottom: 40, left: 60, right: 20 }}
              />
            </Box>
          </Paper>
        )}

        {/* Test Set Weather Breakdown Chart */}
        {datasetInfo.dataset_splits?.test_breakdown && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Test Set Weather Conditions
            </Typography>
            <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
              <BarChart
                xAxis={[{ scaleType: 'band', data: ['Day Fair', 'Day Rain', 'Night Fair', 'Night Rain'] }]}
                series={[{
                  data: [
                    datasetInfo.dataset_splits.test_breakdown.day_fair?.count || 0,
                    datasetInfo.dataset_splits.test_breakdown.day_rain?.count || 0,
                    datasetInfo.dataset_splits.test_breakdown.night_fair?.count || 0,
                    datasetInfo.dataset_splits.test_breakdown.night_rain?.count || 0
                  ],
                  label: 'Frames',
                  color: '#ff9800',
                  valueFormatter: (value, context) => {
                    const conditions = ['day_fair', 'day_rain', 'night_fair', 'night_rain'];
                    const condition = conditions[context.dataIndex];
                    const percentage = datasetInfo.dataset_splits.test_breakdown[condition]?.percentage?.toFixed(1) || '0.0';
                    return `${value?.toLocaleString() || 0} (${percentage}%)`;
                  }
                }]}
                margin={{ top: 20, bottom: 40, left: 60, right: 20 }}
              />
            </Box>
          </Paper>
        )}

        {/* Class Distribution Chart */}
        {classes && classNames.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Class Pixel Distribution
            </Typography>
            <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
              <BarChart
                xAxis={[{ scaleType: 'band', data: classNames }]}
                series={[{
                  data: pixelData,
                  label: 'Pixels',
                  color: '#2e7d32',
                  valueFormatter: (value, context) => {
                    const percentage = pixelPercentages[context.dataIndex];
                    return `${(value || 0).toLocaleString()} (${percentage}%)`;
                  }
                }]}
                margin={{ top: 20, bottom: 60, left: 60, right: 20 }}
              />
            </Box>
          </Paper>
        )}

        {/* Frames per Class Chart */}
        {classes && classNames.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Frames Containing Each Class
            </Typography>
            <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
              <BarChart
                xAxis={[{ scaleType: 'band', data: classNames }]}
                series={[{
                  data: frameData,
                  label: 'Frames',
                  color: '#ed6c02',
                  valueFormatter: (value, context) => {
                    const percentage = framePercentages[context.dataIndex];
                    return `${value?.toLocaleString() || 0} (${percentage}%)`;
                  }
                }]}
                margin={{ top: 20, bottom: 60, left: 60, right: 20 }}
              />
            </Box>
          </Paper>
        )}
      </Box>
    </Box>
  );
};

export default DatasetInfoSection;
