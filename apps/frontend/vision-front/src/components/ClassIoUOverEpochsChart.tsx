import React from 'react';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassIoUOverEpochsChartProps {
  epochs: Epoch[];
}

const ClassIoUOverEpochsChart: React.FC<ClassIoUOverEpochsChartProps> = ({ epochs }) => (
  <ClassMetricChart
    epochs={epochs}
    metric="iou"
    labelFormatter={(className) => `${className} IoU`}
    includeZeroValues
  />
);

export default ClassIoUOverEpochsChart;
