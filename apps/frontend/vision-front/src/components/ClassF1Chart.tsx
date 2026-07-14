import React from 'react';
import ClassMetricChart from './ClassMetricChart';
import { Epoch } from '../types';

interface ClassF1ChartProps {
  epochs: Epoch[];
}

const ClassF1Chart: React.FC<ClassF1ChartProps> = ({ epochs }) => (
  <ClassMetricChart epochs={epochs} metric="f1" />
);

export default ClassF1Chart;
