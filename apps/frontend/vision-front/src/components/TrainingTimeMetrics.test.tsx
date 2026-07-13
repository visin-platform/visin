import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrainingTimeMetrics from './TrainingTimeMetrics';
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

const makeEpoch = (epoch: number, epoch_time?: number): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results: {},
  epoch_time,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z'
});

describe('TrainingTimeMetrics', () => {
  it('renders nothing when epochs is empty', () => {
    const { container } = render(<TrainingTimeMetrics epochs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing meaningful when no epoch has time data', () => {
    const epochs = [makeEpoch(1, 0), makeEpoch(2, 0)];
    const { container } = render(<TrainingTimeMetrics epochs={epochs} />);
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  it('renders the per-epoch time chart when time data is present', () => {
    const epochs = [makeEpoch(1, 120), makeEpoch(2, 90)];
    const { container } = render(<TrainingTimeMetrics epochs={epochs} />);
    expect(screen.getByText('Time Spent Per Epoch')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
