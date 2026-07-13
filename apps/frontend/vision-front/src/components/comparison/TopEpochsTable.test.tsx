import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TopEpochsTable from './TopEpochsTable';
import type { TrainingComparison, ComparisonEpoch } from '../../types';

const makeEpoch = (epoch: number, mean_iou: number, extra: any = {}): ComparisonEpoch => ({
  epoch,
  timestamp: new Date().toISOString(),
  epoch_time: 60,
  results: {
    val: {
      mean_iou,
      loss: 0.5,
      val_loss: 0.4,
      human: { precision: 0.6, recall: 0.7, f1_score: 0.65 },
      ...extra
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

describe('TopEpochsTable', () => {
  it('shows empty state when there is no validation data', () => {
    renderWithRouter(<TopEpochsTable comparisonData={[makeTraining('t1', 'Training One', [])]} />);
    expect(screen.getByText('No Epoch Data Available')).toBeInTheDocument();
  });

  it('renders top epochs ranked by mean IoU descending', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.4), makeEpoch(2, 0.8)]);
    renderWithRouter(<TopEpochsTable comparisonData={[training]} />);
    expect(screen.getByText('Top 10 Best Epochs')).toBeInTheDocument();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Epoch 2');
    expect(rows[0]).toHaveTextContent('#1');
    expect(rows[1]).toHaveTextContent('Epoch 1');
  });

  it('limits results to the top 10 epochs', () => {
    const epochs = Array.from({ length: 15 }, (_, i) => makeEpoch(i + 1, (i + 1) / 20));
    const training = makeTraining('t1', 'Training One', epochs);
    renderWithRouter(<TopEpochsTable comparisonData={[training]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
  });

  it('links training name to the training detail page', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.5)]);
    renderWithRouter(<TopEpochsTable comparisonData={[training]} />);
    expect(screen.getByRole('link', { name: 'Training One' })).toHaveAttribute('href', '/trainings/t1');
  });
});
