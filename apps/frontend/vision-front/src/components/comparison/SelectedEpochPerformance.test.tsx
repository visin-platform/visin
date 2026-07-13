import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SelectedEpochPerformance from './SelectedEpochPerformance';
import type { TrainingComparison, ComparisonEpoch } from '@/types';

const epoch1: ComparisonEpoch = {
  epoch: 1,
  timestamp: new Date().toISOString(),
  results: {
    train: { loss: 0.4, mean_iou: 0.6 },
    val: {
      loss: 0.5,
      mean_iou: 0.55,
      human: { iou: 0.5, precision: 0.6, recall: 0.7, f1: 0.65 },
      vehicle: { iou: 0.7, precision: 0.8, recall: 0.75, f1: 0.77 }
    }
  }
};

const training: TrainingComparison = {
  training: { _id: 't1', name: 'Training One', status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: 1, totalTime: 0, avgEpochTime: 0, maxEpochTime: 0, cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: epoch1,
  epochs: [epoch1],
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
};

const renderWithRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('SelectedEpochPerformance', () => {
  it('renders nothing when no training has selected epoch data', () => {
    const { container } = renderWithRouter(
      <SelectedEpochPerformance
        comparisonData={[training]}
        selectedEpochs={{}}
        handleEpochChange={vi.fn()}
        getSelectedEpochData={() => null}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders performance table and epoch selector when a training has selected epoch data', () => {
    renderWithRouter(
      <SelectedEpochPerformance
        comparisonData={[training]}
        selectedEpochs={{ t1: 1 }}
        handleEpochChange={vi.fn()}
        getSelectedEpochData={(id) => (id === 't1' ? epoch1 : null)}
      />
    );
    expect(screen.getByText('Selected Epoch Performance')).toBeInTheDocument();
    expect(screen.getByText('Train Loss')).toBeInTheDocument();
    expect(screen.getByText('Validation mIoU')).toBeInTheDocument();
  });

  it('renders per-class IoU comparison section with class rows', () => {
    renderWithRouter(
      <SelectedEpochPerformance
        comparisonData={[training]}
        selectedEpochs={{ t1: 1 }}
        handleEpochChange={vi.fn()}
        getSelectedEpochData={(id) => (id === 't1' ? epoch1 : null)}
      />
    );
    expect(screen.getByText('Per-Class IoU Comparison (Selected Epochs)')).toBeInTheDocument();
    expect(screen.getByText('Human')).toBeInTheDocument();
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
  });

  it('calls handleEpochChange when a new epoch is selected', () => {
    const handleEpochChange = vi.fn();
    const epoch2: ComparisonEpoch = { ...epoch1, epoch: 2 };
    const trainingTwoEpochs: TrainingComparison = { ...training, epochs: [epoch1, epoch2] };
    renderWithRouter(
      <SelectedEpochPerformance
        comparisonData={[trainingTwoEpochs]}
        selectedEpochs={{ t1: 1 }}
        handleEpochChange={handleEpochChange}
        getSelectedEpochData={(id) => (id === 't1' ? epoch1 : null)}
      />
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Epoch 2' }));
    expect(handleEpochChange).toHaveBeenCalledWith('t1', 2);
  });
});
