import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ComparisonTable from './ComparisonTable';
import type { TrainingComparison } from '@/types';

const makeComparison = (id: string, name: string, iouValues: number[]): TrainingComparison => ({
  training: { _id: id, name, status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: iouValues.length, totalTime: 3600, avgEpochTime: 100, maxEpochTime: 200, cost: { totalHours: 1, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: null,
  epochs: iouValues.map((v, i) => ({
    epoch: i + 1,
    timestamp: new Date().toISOString(),
    results: { val: { mean_iou: v } }
  })),
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
});

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('ComparisonTable', () => {
  it('renders a row per training with computed metrics', () => {
    const data = [makeComparison('t1', 'Training One', [0.5, 0.6]), makeComparison('t2', 'Training Two', [0.7])];
    renderWithRouter(<ComparisonTable comparisonData={data} />);
    expect(screen.getByText('Training One')).toBeInTheDocument();
    expect(screen.getByText('Training Two')).toBeInTheDocument();
  });

  it('links each training name to its detail page', () => {
    const data = [makeComparison('t1', 'Training One', [0.5])];
    renderWithRouter(<ComparisonTable comparisonData={data} />);
    expect(screen.getByRole('link', { name: 'Training One' })).toHaveAttribute('href', '/trainings/t1');
  });

  it('re-sorts rows when a sortable header is clicked', () => {
    const data = [makeComparison('t1', 'Alpha', [0.9]), makeComparison('t2', 'Beta', [0.1])];
    renderWithRouter(<ComparisonTable comparisonData={data} />);
    // default sort is top10Avg desc -> Alpha first
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Alpha');

    // first click on a new column defaults to desc: Beta before Alpha
    fireEvent.click(screen.getByText('Training'));
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Beta');

    // second click toggles to asc: Alpha before Beta
    fireEvent.click(screen.getByText('Training'));
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Alpha');
  });

  it('disables the LaTeX button when there is no comparison data', () => {
    renderWithRouter(<ComparisonTable comparisonData={[]} />);
    expect(screen.getByRole('button', { name: /LaTeX/i })).toBeDisabled();
  });

  it('opens LaTeX modal with generated content on button click', () => {
    const data = [makeComparison('t1', 'Alpha', [0.9])];
    renderWithRouter(<ComparisonTable comparisonData={data} />);
    fireEvent.click(screen.getByRole('button', { name: /LaTeX/i }));
    expect(screen.getByText('Detailed Comparison LaTeX Code')).toBeInTheDocument();
  });

  it('shows N/A for best epoch/mIoU when a training has no epochs', () => {
    const data = [makeComparison('t1', 'Empty', [])];
    renderWithRouter(<ComparisonTable comparisonData={data} />);
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });
});
