import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectOverviewTab from './ProjectOverviewTab';
import { formatCost } from '../../costing/costing';

const stats = {
  totalTrainings: 5,
  totalTime: 7384, // 2h 3m
  totalCost: 12.5,
  currency: 'EUR',
  avgEpochTime: 120
};

describe('ProjectOverviewTab', () => {
  it('renders the totals strip with formatted values', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={stats} />
      </MemoryRouter>
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2h 3m')).toBeInTheDocument();
    expect(screen.getByText(formatCost(12.5, 'EUR'))).toBeInTheDocument();
  });

  it('reads short times without a leading zero hour', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={{ ...stats, totalTime: 125, avgEpochTime: 42 }} />
      </MemoryRouter>
    );
    expect(screen.getByText('2m')).toBeInTheDocument();
    expect(screen.getByText('42s')).toBeInTheDocument();
  });

  it('leaves the cost out for a project with no rates', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={{ ...stats, currency: undefined }} />
      </MemoryRouter>
    );
    expect(screen.getByText('Training time')).toBeInTheDocument();
    expect(screen.queryByText('Cost')).not.toBeInTheDocument();
  });

  it('shows "-" for avg epoch time when not provided', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={{ ...stats, avgEpochTime: 0 }} />
      </MemoryRouter>
    );
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows defaults of 0 when stats are missing', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={undefined} />
      </MemoryRouter>
    );
    expect(screen.getByText('0s')).toBeInTheDocument();
  });

  it('shows the totals as loading, not as zeros, while they are on their way', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={undefined} isLoading />
      </MemoryRouter>
    );

    expect(screen.getAllByLabelText('Loading').length).toBeGreaterThan(0);
  });
});
