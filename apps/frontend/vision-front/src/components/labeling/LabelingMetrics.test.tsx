import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LabelingMetrics from './LabelingMetrics';

const metrics = {
  good: 10,
  goodPercentage: 50,
  bad: 4,
  badPercentage: 20,
  unlabeled: 6,
  unlabeledPercentage: 30,
  total: 20
};

describe('LabelingMetrics', () => {
  it('shows a loading state', () => {
    render(<LabelingMetrics loading={true} metrics={undefined} />);
    expect(screen.getByText('Loading statistics...')).toBeInTheDocument();
  });

  it('renders nothing when not loading and metrics are undefined', () => {
    const { container } = render(<LabelingMetrics loading={false} metrics={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders good/bad/unlabeled/total counts and percentages', () => {
    render(<LabelingMetrics loading={false} metrics={metrics} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Good (50%)')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Bad (20%)')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Unlabeled (30%)')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('renders the completion progress text', () => {
    const { container } = render(<LabelingMetrics loading={false} metrics={metrics} />);
    expect(container.textContent).toMatch(/Completion:\s*14\s*\/\s*20\s*\(70%\)/);
  });
});
