import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingOtherMetricsTab from './TrainingOtherMetricsTab';
import { Epoch } from '../types';

const makeEpoch = (epoch: number, mathMetrics?: any): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch_uuid: `epoch-uuid-${epoch}`,
  epoch,
  timestamp: '2026-01-01T10:00:00.000Z',
  results: {
    val: {
      loss: 0.5,
      math_metrics: mathMetrics
    } as any
  },
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
});

describe('TrainingOtherMetricsTab', () => {
  it('renders empty state when there are no epochs', () => {
    render(<TrainingOtherMetricsTab epochs={[]} />);
    expect(screen.getByText('No epochs available to display other metrics.')).toBeInTheDocument();
  });

  it('renders no-data state when epochs have no math metrics', () => {
    render(<TrainingOtherMetricsTab epochs={[makeEpoch(1)]} />);
    expect(screen.getByText('No math metrics data available in the epochs.')).toBeInTheDocument();
  });

  it('renders ECE and standard IoU charts when data is present', () => {
    const epochs = [
      makeEpoch(1, { ece: 0.1, overall_margin: 5, overall_variance: 3 }),
      makeEpoch(2, { ece: 0.05, overall_margin: 6, overall_variance: 2 })
    ];
    render(<TrainingOtherMetricsTab epochs={epochs} />);
    expect(screen.getByText('Expected Calibration Error (ECE) Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Prediction Confidence Metrics Over Epochs')).toBeInTheDocument();
    expect(screen.queryByText('Standard IoU Over Epochs')).not.toBeInTheDocument();
  });

  it('renders bin accuracy/confidence and per-class charts when present', () => {
    const epochs = [
      makeEpoch(1, {
        bin_accuracies: [0.1, 0.2],
        bin_confidences: [0.15, 0.25],
        margins_per_class: { car: 5, tree: 2 },
        variance_per_class: { car: 1, tree: 3 }
      })
    ];
    render(<TrainingOtherMetricsTab epochs={epochs} />);
    expect(screen.getByText('Bin Accuracies Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Bin Confidences Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Margins per Class Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Variances per Class Over Epochs')).toBeInTheDocument();
  });
});
