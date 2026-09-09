import React from 'react';
import SingleMetricComparisonTable from './SingleMetricComparisonTable';
import type { ComparisonData } from './performanceMetricsUtils';

interface APMetricsTableProps {
  comparisonData: ComparisonData[];
  decimals?: number;
  multiplier?: number;
  classFilter?: string[];
}

const APMetricsTable: React.FC<APMetricsTableProps> = props => (
  <SingleMetricComparisonTable
    {...props}
    metric="ap"
    title="AP Metrics Comparison"
    describe={(conditionLabel, classesLabel) =>
      `Test results showing AP (Average Precision) metrics by ${conditionLabel} and ${classesLabel}`
    }
    latexName="AP"
    latexLabelPrefix="ap"
  />
);

export default APMetricsTable;
