import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import LossChart from './LossChart';
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

describe('LossChart', () => {
  it('shows the empty message when there is no data', () => {
    render(<LossChart epochs={[]} />);
    expect(screen.getByText('No loss data available for this training')).toBeInTheDocument();
  });

  it('shows the empty message when epochs have zero-valued loss', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0 }, val: { loss: 0 } })];
    render(<LossChart epochs={epochs} />);
    expect(screen.getByText('No loss data available for this training')).toBeInTheDocument();
  });

  it('renders a chart when loss data is present', () => {
    const epochs = [
      makeEpoch(1, { train: { loss: 0.9 }, val: { loss: 0.95 } }),
      makeEpoch(2, { train: { loss: 0.5 }, val: { loss: 0.55 } })
    ];
    const { container } = render(<LossChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Training and Validation Loss')).toBeInTheDocument();
  });
});
