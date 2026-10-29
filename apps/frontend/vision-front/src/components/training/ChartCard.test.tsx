import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartCard from './ChartCard';

describe('ChartCard', () => {
  it('shows the title, the explanation and the chart', () => {
    render(
      <ChartCard title="Loss Metrics" description="Lower is better." color="primary">
        <div data-testid="chart" />
      </ChartCard>
    );

    expect(screen.getByRole('heading', { name: 'Loss Metrics' })).toBeInTheDocument();
    expect(screen.getByText('Lower is better.')).toBeInTheDocument();
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });

  it('marks the card for the guide when asked to', () => {
    const { container } = render(
      <ChartCard title="Mean IoU" description="Overlap." color="secondary" dataGuide="miou-chart">
        <div />
      </ChartCard>
    );

    expect(container.querySelector('[data-guide="miou-chart"]')).toBeTruthy();
  });
});
