import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrainingValidationMetricsTable from './TrainingValidationMetricsTable';
import type { TrainingComparison, ComparisonEpoch } from '../../types';

const makeEpoch = (epoch: number, mean_iou: number): ComparisonEpoch => ({
  epoch,
  timestamp: new Date().toISOString(),
  results: {
    val: {
      mean_iou,
      human: { precision: 0.6, recall: 0.7, f1_score: 0.65 }
    }
  }
});

const makeTraining = (id: string, name: string, epochs: ComparisonEpoch[]): TrainingComparison => ({
  training: { _id: id, name, status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: epochs.length, totalTime: 0, avgEpochTime: 0, maxEpochTime: 0, cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: epochs[epochs.length - 1] ?? null,
  epochs,
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('TrainingValidationMetricsTable', () => {
  it('shows empty state when there is no validation data', () => {
    renderWithRouter(<TrainingValidationMetricsTable comparisonData={[makeTraining('t1', 'Training One', [])]} />);
    expect(screen.getByText('No Validation Metrics Available')).toBeInTheDocument();
  });

  it('renders training rows with computed metrics', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.6)]);
    renderWithRouter(<TrainingValidationMetricsTable comparisonData={[training]} />);
    expect(screen.getByText('Training Validation Metrics')).toBeInTheDocument();
    expect(screen.getByText('Training One')).toBeInTheDocument();
  });

  it('re-sorts rows when a header is clicked', () => {
    const trainingA = makeTraining('t1', 'Low', [makeEpoch(1, 0.1)]);
    const trainingB = makeTraining('t2', 'High', [makeEpoch(1, 0.9)]);
    renderWithRouter(<TrainingValidationMetricsTable comparisonData={[trainingA, trainingB]} />);
    // default sort: meanIoU desc -> High first
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('High');

    fireEvent.click(screen.getByText('Val mIoU'));
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Low'); // toggled to asc
  });

  it('opens the LaTeX modal on export click', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.6)]);
    renderWithRouter(<TrainingValidationMetricsTable comparisonData={[training]} />);
    fireEvent.click(screen.getByRole('button', { name: /LaTeX/i }));
    expect(screen.getByText('Training Validation Metrics LaTeX Code')).toBeInTheDocument();
  });
});
