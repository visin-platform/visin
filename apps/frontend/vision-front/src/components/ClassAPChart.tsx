import React from 'react';
import { Box, Typography } from '@mui/material';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassAPChartProps {
  epochs: Epoch[];
}

const apEmptyState = (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      Average Precision (AP) is not calculated during training epochs.
      AP metrics are available in test results.
    </Typography>
  </Box>
);

const ClassAPChart: React.FC<ClassAPChartProps> = ({ epochs }) => (
  <ClassMetricChart epochs={epochs} metric="ap" emptyState={apEmptyState} />
);

export default ClassAPChart;
