import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EpochsSummaryCard } from './EpochsSummaryCard';
import type { Epoch } from '../types';

describe('EpochsSummaryCard', () => {
  it('shows an empty state when there are no epochs', () => {
    render(<EpochsSummaryCard epochs={[]} />);

    expect(screen.getByText('No epoch data available')).toBeInTheDocument();
  });

  it('renders the latest epoch number and formatted metrics', () => {
    const epochs = [
      { epoch: 1, results: {} },
      {
        epoch: 5,
        results: {
          train: { loss: 0.123456, mean_iou: 0.5 },
          val: { loss: 0.2, mean_iou: 0.456789 },
        },
      },
    ] as unknown as Epoch[];
    render(<EpochsSummaryCard epochs={epochs} />);

    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('0.1235')).toBeInTheDocument();
    expect(screen.getByText('0.2000')).toBeInTheDocument();
    expect(screen.getByText('0.5000')).toBeInTheDocument();
    expect(screen.getByText('0.4568')).toBeInTheDocument();
  });

  it('shows "-" for missing metric fields', () => {
    const epochs = [{ epoch: 1, results: {} }] as unknown as Epoch[];
    render(<EpochsSummaryCard epochs={epochs} />);

    expect(screen.getAllByText('-').length).toBe(4);
  });
});
