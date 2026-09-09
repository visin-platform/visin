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
import { useTaxonomy } from '../taxonomy/useTaxonomy';
import { orderKeysByTaxonomy } from '../taxonomy/resolveTaxonomy';

interface DatasetClassStats {
  name?: string;
  total_pixels?: number;
  frames_with_class?: number;
}

// The dataset analysis pipeline's output — a Mixed/dynamic field on the
// backend, so its real shape is only known here at the point of use.
interface DatasetInfo {
  segmentation_statistics?: {
    classes?: Record<string, DatasetClassStats>;
  };
  dataset_overview?: {
    name?: string;
    version?: string;
    total_frames?: number;
    total_pixels?: number;
    classes?: Record<string, unknown>;
  };
  dataset_splits?: {
    train_frames?: number;
    validation_frames?: number;
    test_frames?: number;
    test_breakdown?: Record<string, { count?: number; percentage?: number }>;
  };
}

interface DatasetInfoSectionProps {
  training: Training;
}

export const DatasetInfoSection: React.FC<DatasetInfoSectionProps> = ({ training }) => {
  const taxonomy = useTaxonomy();

  if (!training.metadata?.dataset_info) {
    return null;
  }

  const datasetInfo = training.metadata.dataset_info as DatasetInfo;

  // Every condition the breakdown reports, ordered by the project taxonomy where
  // it names them. The old version listed four bars by hand and silently dropped
  // any other condition — `snow` never appeared at all.
  const testBreakdown = datasetInfo.dataset_splits?.test_breakdown;
  const breakdownKeys = orderKeysByTaxonomy(taxonomy.conditions, testBreakdown);
  const classes = datasetInfo.segmentation_statistics?.classes;
  const classNames = classes ? Object.values(classes).map((cls) => cls.name || 'Unknown') : [];
  const pixelData = classes ? Object.values(classes).map((cls) => cls.total_pixels || 0) : [];
  const frameData = classes ? Object.values(classes).map((cls) => cls.frames_with_class || 0) : [];

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
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 2
            }}>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Dataset Name
              </Typography>
              <Typography variant="body2" sx={{
                fontWeight: 500
              }}>
                {datasetInfo.dataset_overview?.name || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Version
              </Typography>
              <Typography variant="body2" sx={{
                fontWeight: 500
              }}>
                {datasetInfo.dataset_overview?.version || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Total Frames
              </Typography>
              <Typography variant="body2" sx={{
                fontWeight: 500
              }}>
                {datasetInfo.dataset_overview?.total_frames?.toLocaleString() || '-'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                Classes
              </Typography>
              <Typography variant="body2" sx={{
                fontWeight: 500
              }}>
                {Object.keys(datasetInfo.dataset_overview?.classes || {}).length}
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
      {/* Dataset Charts Grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' },
          gap: 3,
          mb: 3
        }}>
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

        {/* Test Set Condition Breakdown Chart */}
        {breakdownKeys.length > 0 && (
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Test Set {taxonomy.conditionLabel}s
            </Typography>
            <Box sx={{ width: '100%', height: { xs: 300, sm: 350, md: 400 } }}>
              <BarChart
                xAxis={[{ scaleType: 'band', data: breakdownKeys.map(key => taxonomy.conditionTitle(key)) }]}
                series={[{
                  data: breakdownKeys.map(key => testBreakdown?.[key]?.count || 0),
                  label: 'Frames',
                  color: '#ff9800',
                  valueFormatter: (value, context) => {
                    const key = breakdownKeys[context.dataIndex];
                    const percentage = testBreakdown?.[key]?.percentage?.toFixed(1) || '0.0';
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
