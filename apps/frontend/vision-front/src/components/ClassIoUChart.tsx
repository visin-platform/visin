import React from 'react';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassIoUChartProps {
  epochs: Epoch[];
}

const ClassIoUChart: React.FC<ClassIoUChartProps> = ({ epochs }) => (
  <ClassMetricChart epochs={epochs} metric="iou" />
);

export default ClassIoUChart;
