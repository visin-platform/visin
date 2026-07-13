import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import MIoUChart from './MIoUChart';
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

describe('MIoUChart', () => {
  it('shows the empty message when there is no data', () => {
    render(<MIoUChart epochs={[]} />);
    expect(screen.getByText('No MIoU data available for this training')).toBeInTheDocument();
  });

  it('shows the empty message when epochs have zero-valued mIoU', () => {
    const epochs = [makeEpoch(1, { train: { mean_iou: 0 }, val: { mean_iou: 0 } })];
    render(<MIoUChart epochs={epochs} />);
    expect(screen.getByText('No MIoU data available for this training')).toBeInTheDocument();
  });

  it('renders a chart when mIoU data is present', () => {
    const epochs = [
      makeEpoch(1, { train: { mean_iou: 0.4 }, val: { mean_iou: 0.35 } }),
      makeEpoch(2, { train: { mean_iou: 0.6 }, val: { mean_iou: 0.55 } })
    ];
    const { container } = render(<MIoUChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(screen.getByText('Training and Validation MIoU')).toBeInTheDocument();
  });
});
