import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClassAPChart from './ClassAPChart';
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

describe('ClassAPChart', () => {
  it('renders nothing when epochs is empty', () => {
    const { container } = render(<ClassAPChart epochs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows an informational message when no AP data is present', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0.1 }, val: { loss: 0.2 } })];
    render(<ClassAPChart epochs={epochs} />);
    expect(
      screen.getByText(/Average Precision \(AP\) is not calculated during training epochs\./)
    ).toBeInTheDocument();
  });

  it('renders a chart for regular classes with AP data', () => {
    const epochs = [
      makeEpoch(1, { val: { loss: 0.1, vehicle: { ap: 0.5 } as any } }),
      makeEpoch(2, { val: { loss: 0.1, vehicle: { ap: 0.7 } as any } })
    ];
    const { container } = render(<ClassAPChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('splits out _2d suffixed classes into a separate chart', () => {
    const epochs = [
      makeEpoch(1, {
        val: {
          loss: 0.1,
          vehicle: { ap: 0.5 } as any,
          vehicle_2d: { ap: 0.4 } as any
        }
      })
    ];
    render(<ClassAPChart epochs={epochs} />);
    // Both the regular and the _2d class chart legends should be rendered
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText('vehicle_2d')).toBeInTheDocument();
  });

  it('falls back to per_class structure when val/train do not have direct ap fields', () => {
    const epochs = [
      makeEpoch(1, {
        val: { loss: 0.1, per_class: { vehicle: { ap: { mean: 0.6 } } } } as any
      })
    ];
    const { container } = render(<ClassAPChart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
