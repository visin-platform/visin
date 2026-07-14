import React from 'react';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassPrecisionChartProps {
  epochs: Epoch[];
}

const ClassPrecisionChart: React.FC<ClassPrecisionChartProps> = ({ epochs }) => (
  <ClassMetricChart epochs={epochs} metric="precision" />
);

export default ClassPrecisionChart;
