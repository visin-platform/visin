import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrainingStats } from './TrainingStats';

const stats = {
  totalTrainings: 12,
  totalTime: 7230,
  totalCpuCost: 1.234,
  totalGpuCost: 5.678,
  totalCost: 6.912,
};

describe('TrainingStats', () => {
  it('renders all five stat cards with formatted values', () => {
    render(<TrainingStats stats={stats} selectedTags={[]} />);

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('€1.23')).toBeInTheDocument();
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
});
