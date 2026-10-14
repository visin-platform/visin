import React from 'react';
import SingleMetricComparisonTable from './SingleMetricComparisonTable';
import type { ComparisonData } from './performanceMetricsUtils';

interface IoUMetricsTableProps {
  comparisonData: ComparisonData[];
  decimals?: number;
  multiplier?: number;
  classFilter?: string[];
}

const IoUMetricsTable: React.FC<IoUMetricsTableProps> = props => (
  <SingleMetricComparisonTable
    {...props}
    metric="iou"
    title="IoU Metrics Comparison"
    describe={(conditionLabel, classesLabel) =>
      `Test results showing IoU (Intersection over Union) metrics by ${conditionLabel} and ${classesLabel}`
    }
    latexName="IoU"
    latexLabelPrefix="iou"
  />
);

export default IoUMetricsTable;
