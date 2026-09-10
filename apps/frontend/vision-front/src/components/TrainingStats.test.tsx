import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainingStats } from './TrainingStats';
import { formatCost } from '../costing/costing';

const stats = {
  totalTrainings: 12,
  totalTime: 7230,
  totalCpuCost: 1.234,
  currency: 'EUR',
  totalGpuCost: 5.678,
  totalCost: 6.912,
};

describe('TrainingStats', () => {
  it('shows separate currency subtotals and the extent of unpriced training', () => {
    render(<TrainingStats selectedTags={[]} stats={{
      totalTrainings: 5,
      totalTime: 16200,
      costTotalsByCurrency: [
        { currency: 'EUR', totalCpuCost: 5, totalGpuCost: 15, totalCost: 20 },
        { currency: 'USD', totalCpuCost: 20, totalGpuCost: 80, totalCost: 100 },
      ],
      costCoverage: { pricedTrainings: 4, unpricedTrainings: 1, pricedTime: 14400, unpricedTime: 1800 },
    }} />);

    expect(screen.getByText(formatCost(20, 'EUR'))).toBeInTheDocument();
    expect(screen.getByText(formatCost(100, 'USD'))).toBeInTheDocument();
    expect(screen.queryByText(/120/)).not.toBeInTheDocument();
    expect(screen.getByText('Cost estimates cover 4 of 5 trainings (4h priced; 0.5h unpriced), using current project rates.'))
      .toBeInTheDocument();
  });

  it('keeps a zero-cost currency subtotal visible', () => {
    render(<TrainingStats selectedTags={[]} stats={{
      totalTrainings: 1,
      totalTime: 3600,
      costTotalsByCurrency: [{ currency: 'EUR', totalCpuCost: 0, totalGpuCost: 0, totalCost: 0 }],
    }} />);

    expect(screen.getAllByText(formatCost(0, 'EUR'))).toHaveLength(3);
  });

  it('shows unpriced coverage and no money when no rates exist', () => {
    render(<TrainingStats selectedTags={[]} stats={{
      totalTrainings: 2,
      totalTime: 3600,
      costTotalsByCurrency: [],
      costCoverage: { pricedTrainings: 0, unpricedTrainings: 2, pricedTime: 0, unpricedTime: 3600 },
    }} />);

    expect(screen.getAllByText('-')).toHaveLength(3);
    expect(screen.getByText(/Cost estimates cover 0 of 2 trainings/)).toBeInTheDocument();
  });

  it('renders all five stat cards with formatted values', () => {
    render(<TrainingStats stats={stats} selectedTags={[]} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText(formatCost(1.234, 'EUR'))).toBeInTheDocument();
    expect(screen.getByText('€5.68')).toBeInTheDocument();
    expect(screen.getByText('€6.91')).toBeInTheDocument();
  });

  it('hides the tag filter summary when no tags are selected', () => {
    render(<TrainingStats stats={stats} selectedTags={[]} />);

    expect(screen.queryByText('Filtered by:')).not.toBeInTheDocument();
  });

  it('shows selected tags as chips when filtered', () => {
    render(<TrainingStats stats={stats} selectedTags={['a', 'b']} />);

    expect(screen.getByText('Filtered by:')).toBeInTheDocument();
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });

  it('shows a dash when the project has no cost rates', () => {
    // no `currency` on the stats means the backend reported no money at all
    render(
      <TrainingStats
        stats={{ ...stats, currency: undefined, totalCpuCost: undefined, totalGpuCost: undefined, totalCost: undefined }}
        selectedTags={[]}
      />
    );
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});
