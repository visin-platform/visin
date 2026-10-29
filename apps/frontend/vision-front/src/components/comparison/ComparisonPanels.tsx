import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import ComparisonTable from './ComparisonTable';
import TrainingClassIoUTable from './TrainingClassIoUTable';
import TrainingValidationMetricsTable from './TrainingValidationMetricsTable';
import BenchmarksComparisonTable from './BenchmarksComparisonTable';
import PerformanceMetricsTable from '../result-tables/PerformanceMetricsTable';
import IoUMetricsTable from '../result-tables/IoUMetricsTable';
import APMetricsTable from '../result-tables/APMetricsTable';
import NumberFormattingControls from '../common/NumberFormattingControls';

interface FormattingProps {
  decimals: number;
  multiplier: number;
  onDecimalsChange: (decimals: number) => void;
  onMultiplierChange: (multiplier: number) => void;
}

/** The runs' training curves, summarised and broken down by class and by validation metric. */
export const TrainingMetricsPanel: React.FC<
  FormattingProps & { comparisonData: React.ComponentProps<typeof ComparisonTable>['comparisonData'] }
> = ({ comparisonData, decimals, multiplier, onDecimalsChange, onMultiplierChange }) => (
  <Box>
    <Typography variant="h6" gutterBottom>
      Training Metrics Comparison
    </Typography>

    {/* Number Formatting Controls */}
    <NumberFormattingControls
      decimals={decimals}
      multiplier={multiplier}
      onDecimalsChange={onDecimalsChange}
      onMultiplierChange={onMultiplierChange}
    />

    {comparisonData.length > 0 ? (
      <>
        <ComparisonTable
          comparisonData={comparisonData}
          decimals={decimals}
          multiplier={multiplier}
        />

        <Box sx={{ mt: 4 }}>
          <TrainingClassIoUTable
            comparisonData={comparisonData}
            decimals={decimals}
            multiplier={multiplier}
          />
        </Box>

        <Box sx={{ mt: 4 }}>
          <TrainingValidationMetricsTable
            comparisonData={comparisonData}
            decimals={decimals}
            multiplier={multiplier}
          />
        </Box>
      </>
    ) : (
      <Alert severity="info">No training data available for comparison.</Alert>
    )}
  </Box>
);

/** The runs' evaluations side by side. */
export const EvaluationsPanel: React.FC<
  FormattingProps & { comparisonData: React.ComponentProps<typeof PerformanceMetricsTable>['comparisonData'] }
> = ({ comparisonData, decimals, multiplier, onDecimalsChange, onMultiplierChange }) => (
  <Box>
    <Typography variant="h6" gutterBottom>
      Evaluations Comparison
    </Typography>

    {/* Number Formatting Controls */}
    <NumberFormattingControls
      decimals={decimals}
      multiplier={multiplier}
      onDecimalsChange={onDecimalsChange}
      onMultiplierChange={onMultiplierChange}
    />

    {comparisonData.length > 0 ? (
      <>
        <PerformanceMetricsTable
          comparisonData={comparisonData}
          decimals={decimals}
          multiplier={multiplier}
        />
        <Box sx={{ mt: 4 }}>
          <IoUMetricsTable
            comparisonData={comparisonData}
            decimals={decimals}
            multiplier={multiplier}
          />
        </Box>
        <Box sx={{ mt: 4 }}>
          <APMetricsTable
            comparisonData={comparisonData}
            decimals={decimals}
            multiplier={multiplier}
          />
        </Box>
      </>
    ) : (
      <Alert severity="info">None of these runs has evaluations to compare. A run reports them from its test stage, after training.</Alert>
    )}
  </Box>
);

/** The runs' benchmarks side by side. */
export const BenchmarksPanel: React.FC<{ benchmarks: React.ComponentProps<typeof BenchmarksComparisonTable>['benchmarks'] }> = ({
  benchmarks
}) => (
  <Box>
    <Typography variant="h6" gutterBottom>
      Benchmarks Comparison
    </Typography>
    {benchmarks.length > 0 ? (
      <BenchmarksComparisonTable benchmarks={benchmarks} />
    ) : (
      <Alert severity="info">No benchmark data available for comparison.</Alert>
    )}
  </Box>
);
