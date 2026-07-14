import React from 'react';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassRecallChartProps {
  epochs: Epoch[];
}

const ClassRecallChart: React.FC<ClassRecallChartProps> = ({ epochs }) => (
  <ClassMetricChart epochs={epochs} metric="recall" />
);

export default ClassRecallChart;
