import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TrainingClassIoUTable from './TrainingClassIoUTable';
import type { TrainingComparison, ComparisonEpoch } from '../../types';

const makeEpoch = (epoch: number, mean_iou: number, humanIoU: number, vehicleIoU: number): ComparisonEpoch => ({
  epoch,
  timestamp: new Date().toISOString(),
  results: {
    val: {
      mean_iou,
      human: { iou: humanIoU },
      vehicle: { iou: vehicleIoU }
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

describe('TrainingClassIoUTable', () => {
  it('shows empty state when there is no class IoU data', () => {
    renderWithRouter(<TrainingClassIoUTable comparisonData={[makeTraining('t1', 'Training One', [])]} />);
    expect(screen.getByText('No Class IoU Data Available')).toBeInTheDocument();
  });

  it('renders class columns and training rows', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.6, 0.5, 0.7)]);
    renderWithRouter(<TrainingClassIoUTable comparisonData={[training]} />);
    expect(screen.getByText('Training Validation IoU per Class')).toBeInTheDocument();
    expect(screen.getByText('human')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText('Training One')).toBeInTheDocument();
  });

  it('bolds the best IoU value across trainings for a class', () => {
    const trainingA = makeTraining('t1', 'A', [makeEpoch(1, 0.9, 0.9, 0.5)]);
    const trainingB = makeTraining('t2', 'B', [makeEpoch(1, 0.3, 0.2, 0.5)]);
    renderWithRouter(<TrainingClassIoUTable comparisonData={[trainingA, trainingB]} />);
    // 0.9 mean should be bold (fontWeight 700) for the "human" class in training A
    const cellText = screen.getByText('90.00 ± 0.00');
    expect(cellText).toHaveStyle({ fontWeight: 700 });
  });

  it('re-sorts rows when training column header is clicked', () => {
    const trainingA = makeTraining('t1', 'Zeta', [makeEpoch(1, 0.9, 0.9, 0.5)]);
    const trainingB = makeTraining('t2', 'Alpha', [makeEpoch(1, 0.3, 0.2, 0.5)]);
    renderWithRouter(<TrainingClassIoUTable comparisonData={[trainingA, trainingB]} />);
    fireEvent.click(screen.getByText('Training'));
    let rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Zeta'); // desc

    fireEvent.click(screen.getByText('Training'));
    rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('Alpha'); // asc
  });

  it('opens the LaTeX modal when the LaTeX button is clicked', () => {
    const training = makeTraining('t1', 'Training One', [makeEpoch(1, 0.6, 0.5, 0.7)]);
    renderWithRouter(<TrainingClassIoUTable comparisonData={[training]} />);
    fireEvent.click(screen.getByRole('button', { name: /LaTeX/i }));
    expect(screen.getByText('Training Class IoU LaTeX Code')).toBeInTheDocument();
  });
});
