import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClassF1Chart from './ClassF1Chart';
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

describe('ClassF1Chart', () => {
  it('renders nothing when epochs is empty', () => {
    const { container } = render(<ClassF1Chart epochs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no class has f1 data', () => {
    const epochs = [makeEpoch(1, { train: { loss: 0.1 }, val: { loss: 0.2 } })];
    const { container } = render(<ClassF1Chart epochs={epochs} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a chart for regular classes with f1 data', () => {
    const epochs = [
      makeEpoch(1, { val: { loss: 0.1, vehicle: { f1: 0.5 } as any } }),
      makeEpoch(2, { val: { loss: 0.1, vehicle: { f1: 0.7 } as any } })
    ];
    const { container } = render(<ClassF1Chart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('splits out _2d suffixed classes into a separate chart', () => {
    const epochs = [
      makeEpoch(1, {
        val: {
          loss: 0.1,
          vehicle: { f1: 0.5 } as any,
          vehicle_2d: { f1: 0.4 } as any
        }
      })
    ];
    render(<ClassF1Chart epochs={epochs} />);
    // series labels are humanized now that they come from the taxonomy
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.getByText('Vehicle 2d')).toBeInTheDocument();
  });

  it('falls back to per_class structure when direct fields are missing', () => {
    const epochs = [
      makeEpoch(1, {
        val: { loss: 0.1, per_class: { vehicle: { f1: 0.6 } } } as any
      })
    ];
    const { container } = render(<ClassF1Chart epochs={epochs} />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
