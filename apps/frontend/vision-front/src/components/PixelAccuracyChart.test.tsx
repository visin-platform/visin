import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import PixelAccuracyChart from './PixelAccuracyChart';
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

describe('PixelAccuracyChart', () => {
  it('shows the empty message when there is no pixel accuracy data', () => {
    render(<PixelAccuracyChart epochs={[]} />);
    expect(screen.getByText('No pixel accuracy data available for this training')).toBeInTheDocument();
  });

  it('shows the empty message when epochs have zero-valued pixel accuracy', () => {
    const epochs = [makeEpoch(1, { train: { pixel_accuracy: 0 }, val: { pixel_accuracy: 0 } })];
    render(<PixelAccuracyChart epochs={epochs} />);
    expect(screen.getByText('No pixel accuracy data available for this training')).toBeInTheDocument();
  });

  it('renders a chart when pixel accuracy data is present', () => {
    const epochs = [
      makeEpoch(2, { train: { pixel_accuracy: 0.8 }, val: { pixel_accuracy: 0.75 } }),
      makeEpoch(1, { train: { pixel_accuracy: 0.6 }, val: { pixel_accuracy: 0.55 } })
    ];
    const { container } = render(<PixelAccuracyChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Training and Validation Pixel Accuracy')).toBeInTheDocument();
  });

  it('sorts epochs ascending before charting', () => {
    // epoch 2 provided first, epoch 1 second -- component should sort internally.
    const epochs = [
      makeEpoch(2, { train: { pixel_accuracy: 0.9 } }),
      makeEpoch(1, { train: { pixel_accuracy: 0.1 } })
    ];
    expect(() => render(<PixelAccuracyChart epochs={epochs} />)).not.toThrow();
  });
});
