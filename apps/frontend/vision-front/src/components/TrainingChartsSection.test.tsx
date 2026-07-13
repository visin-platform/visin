import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingChartsSection from './TrainingChartsSection';
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

const makeEpoch = (epoch: number, results: Epoch['results'], learning_rate?: number): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results,
  learning_rate,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
});

describe('TrainingChartsSection', () => {
  it('renders nothing beyond the container when epochs is empty', () => {
    const { container } = render(<TrainingChartsSection epochs={[]} />);
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('renders the loss chart when train loss data is present', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0.5 }, val: { loss: 0.6 } })];
    render(<TrainingChartsSection epochs={epochs} />);
    expect(screen.getByText('Loss Over Epochs')).toBeInTheDocument();
  });

  it('renders the mean IoU chart when train mean_iou data is present', () => {
    const epochs = [makeEpoch(1, { train: { mean_iou: 0.4 }, val: { mean_iou: 0.5 } })];
    render(<TrainingChartsSection epochs={epochs} />);
    expect(screen.getByText('Mean IoU Over Epochs')).toBeInTheDocument();
  });

  it('renders the learning rate chart when learning rates are present', () => {
    const epochs = [makeEpoch(1, {}, 0.001)];
    render(<TrainingChartsSection epochs={epochs} />);
    expect(screen.getByText('Learning Rate Schedule (×10⁶)')).toBeInTheDocument();
  });

  it('renders the class IoU over time chart whenever there are epochs', () => {
    const epochs = [
      makeEpoch(1, {
        val: { vehicle: { iou: 0.5 } as any, sign: { iou: 0.3 } as any },
        train: { vehicle: { iou: 0.4 } as any }
      })
    ];
    render(<TrainingChartsSection epochs={epochs} />);
    expect(screen.getByText('Class IoU Over Time')).toBeInTheDocument();
  });

  it('renders all four charts together for a fully populated epoch', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0.5, mean_iou: 0.4 }, val: { loss: 0.6, mean_iou: 0.5 } }, 0.001)];
    render(<TrainingChartsSection epochs={epochs} />);
    expect(screen.getByText('Loss Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Mean IoU Over Epochs')).toBeInTheDocument();
    expect(screen.getByText('Learning Rate Schedule (×10⁶)')).toBeInTheDocument();
    expect(screen.getByText('Class IoU Over Time')).toBeInTheDocument();
  });
});
