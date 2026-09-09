import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrainingMetricsTable from './TrainingMetricsTable';
import type { TrainingComparison } from '../../types';

const makeTraining = (id: string, name: string, aggregatedTestResults: any): TrainingComparison => ({
  training: { _id: id, name, status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: 0, totalTime: 0, avgEpochTime: 0, maxEpochTime: 0, cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: null,
  epochs: [],
  aggregatedTestResults,
  testResultsCount: 0,
  benchmarks: []
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TrainingMetricsTable', () => {
  it('shows empty state when no training has aggregated test results', () => {
    renderWithRouter(<TrainingMetricsTable comparisonData={[makeTraining('t1', 'Training One', null)]} />);
    expect(screen.getByText('No Test Results Available')).toBeInTheDocument();
  });

  it('renders per-condition tables with metrics for trainings that have results', () => {
    const aggregatedTestResults = {
      day_fair: {
        human: { iou: { mean: 0.5 }, precision: { mean: 0.6 }, recall: { mean: 0.7 }, f1_score: { mean: 0.65 } },
        vehicle: { iou: { mean: 0.4 }, precision: { mean: 0.5 }, recall: { mean: 0.6 }, f1_score: { mean: 0.55 } },
        sign: { iou: { mean: 0.3 }, precision: { mean: 0.4 }, recall: { mean: 0.5 }, f1_score: { mean: 0.45 } }
      }
    };
    renderWithRouter(<TrainingMetricsTable comparisonData={[makeTraining('t1', 'Training One', aggregatedTestResults)]} />);
    expect(screen.getByText('Performance Metrics Summary')).toBeInTheDocument();
    expect(screen.getByText('DAY FAIR')).toBeInTheDocument();
    expect(screen.getAllByText('Training One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.500').length).toBeGreaterThan(0);
  });

  it('shows N/A where a class is missing a metric the condition otherwise reports', () => {
    // `sign` reports only iou, so its precision/recall/f1 cells fall back to N/A
    const partial = {
      day_fair: {
        human: { iou: { mean: 0.5 }, precision: { mean: 0.5 }, recall: { mean: 0.5 }, f1_score: { mean: 0.5 } },
        sign: { iou: { mean: 0.3 } }
      }
    };
    renderWithRouter(<TrainingMetricsTable comparisonData={[makeTraining('t1', 'Training One', partial)]} />);
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('links training name to its detail page', () => {
    renderWithRouter(<TrainingMetricsTable comparisonData={[makeTraining('t1', 'Training One', { day_fair: {} })]} />);
    expect(screen.getAllByRole('link', { name: 'Training One' })[0]).toHaveAttribute('href', '/trainings/t1');
  });
});
