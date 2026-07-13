import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AggregatedTestResultsTable from './AggregatedTestResultsTable';
import type { AggregatedStats } from '../../hooks/useAggregatedStats';

const metricStat = (mean: number, values: number[] = [mean]) => ({ mean, values });

const aggregatedStats: AggregatedStats = {
  day_fair: {
    vehicle: { iou: metricStat(0.8), precision: metricStat(0.7), recall: metricStat(0.6), ap: metricStat(0.5) },
    sign: { iou: metricStat(0.4), precision: metricStat(0.3), recall: metricStat(0.2), ap: metricStat(0.1) },
    human: { iou: metricStat(0.9), precision: metricStat(0.9), recall: metricStat(0.9), ap: metricStat(0.9) },
  },
} as unknown as AggregatedStats;

describe('AggregatedTestResultsTable', () => {
  it('renders per-condition mean metrics formatted to 2 decimals', () => {
    render(
      <AggregatedTestResultsTable
        aggregatedStats={aggregatedStats}
        hasCyclistPedestrianData={false}
        testResultsCount={3}
        onAggregatedLatexExport={vi.fn()}
      />
    );

    expect(screen.getByText('Dry Day')).toBeInTheDocument();
    expect(screen.getByText('0.80')).toBeInTheDocument();
  });

  it('skips conditions with no aggregated data', () => {
    render(
      <AggregatedTestResultsTable
        aggregatedStats={{}}
        hasCyclistPedestrianData={false}
        testResultsCount={0}
        onAggregatedLatexExport={vi.fn()}
      />
    );

    expect(screen.queryByText('Dry Day')).not.toBeInTheDocument();
  });

  it('shows "-" for metrics with no collected values', () => {
    const sparse = { day_fair: { vehicle: { iou: { mean: 0, values: [] } } } } as unknown as AggregatedStats;
    render(
      <AggregatedTestResultsTable
        aggregatedStats={sparse}
        hasCyclistPedestrianData={false}
        testResultsCount={1}
        onAggregatedLatexExport={vi.fn()}
      />
    );

    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('shows cyclist+pedestrian columns when enabled', () => {
    render(
      <AggregatedTestResultsTable
        aggregatedStats={aggregatedStats}
        hasCyclistPedestrianData
        testResultsCount={1}
        onAggregatedLatexExport={vi.fn()}
      />
    );

    expect(screen.getAllByText('Cyc+Ped').length).toBeGreaterThan(0);
  });

  it('calls onAggregatedLatexExport with the current props', () => {
    const onAggregatedLatexExport = vi.fn();
    render(
      <AggregatedTestResultsTable
        aggregatedStats={aggregatedStats}
        hasCyclistPedestrianData={false}
        testResultsCount={3}
        onAggregatedLatexExport={onAggregatedLatexExport}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /export latex/i }));

    expect(onAggregatedLatexExport).toHaveBeenCalledWith(aggregatedStats, false, 3);
  });
});
