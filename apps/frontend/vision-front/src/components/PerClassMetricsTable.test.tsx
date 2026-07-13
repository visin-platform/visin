import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PerClassMetricsTable } from './PerClassMetricsTable';
import type { Epoch } from '../types';

const makeEpoch = (perClass: Record<string, unknown> = {}): Epoch =>
  ({ epoch: 1, results: { metrics: { per_class: perClass } } } as unknown as Epoch);

describe('PerClassMetricsTable', () => {
  it('renders nothing when there are no epochs', () => {
    const { container } = render(<PerClassMetricsTable epochs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the latest epoch has no per-class metrics', () => {
    const { container } = render(<PerClassMetricsTable epochs={[makeEpoch()]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders per-class metrics from the latest epoch, formatted to 4 decimals', () => {
    render(
      <PerClassMetricsTable
        epochs={[
          makeEpoch({}),
          makeEpoch({ car: { iou: 0.812345, precision: 0.7, recall: 0.6, f1: 0.65 } }),
        ]}
      />
    );

    expect(screen.getByText('car')).toBeInTheDocument();
    expect(screen.getByText('0.8123')).toBeInTheDocument();
  });

  it('shows "-" for missing metric fields', () => {
    render(<PerClassMetricsTable epochs={[makeEpoch({ car: {} })]} />);

    expect(screen.getAllByText('-').length).toBe(4);
  });
});
