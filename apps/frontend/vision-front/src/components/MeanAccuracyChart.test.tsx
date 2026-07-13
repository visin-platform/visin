import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import MeanAccuracyChart from './MeanAccuracyChart';
import type { Epoch } from '../types';

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-expect-error test polyfill
  global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;
});

const makeEpoch = (epoch: number, results: Epoch['results']): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
});

describe('MeanAccuracyChart', () => {
  it('shows the empty message when there is no data', () => {
    render(<MeanAccuracyChart epochs={[]} />);
    expect(screen.getByText('No mean accuracy data available for this training')).toBeInTheDocument();
  });

  it('shows the empty message when epochs have zero-valued mean accuracy', () => {
    const epochs = [makeEpoch(1, { train: { mean_accuracy: 0 }, val: { mean_accuracy: 0 } })];
    render(<MeanAccuracyChart epochs={epochs} />);
    expect(screen.getByText('No mean accuracy data available for this training')).toBeInTheDocument();
  });

  it('renders a chart when mean accuracy data is present', () => {
    const epochs = [
      makeEpoch(1, { train: { mean_accuracy: 0.6 }, val: { mean_accuracy: 0.55 } }),
      makeEpoch(2, { train: { mean_accuracy: 0.8 }, val: { mean_accuracy: 0.75 } })
    ];
    const { container } = render(<MeanAccuracyChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Training and Validation Mean Accuracy')).toBeInTheDocument();
  });
});
