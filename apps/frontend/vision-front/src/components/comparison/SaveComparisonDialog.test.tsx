import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SaveComparisonDialog from './SaveComparisonDialog';
import type { TrainingComparison } from '@/types';

const makeComparison = (id: string, name: string): TrainingComparison => ({
  training: { _id: id, name, status: 'completed', createdAt: '', updatedAt: '' },
  metrics: { totalEpochs: 0, totalTime: 0, avgEpochTime: 0, maxEpochTime: 0, cost: { totalHours: 0, cpuCost: 0, gpuCost: 0, totalCost: 0 } },
  lastEpoch: null,
  epochs: [],
  aggregatedTestResults: null,
  testResultsCount: 0,
  benchmarks: []
});

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  comparisonName: 'My Comparison',
  setComparisonName: vi.fn(),
  comparisonDescription: '',
  setComparisonDescription: vi.fn(),
  selectedTrainingIds: ['t1'],
  handleTrainingIdToggle: vi.fn(),
  comparisonData: [makeComparison('t1', 'Training One'), makeComparison('t2', 'Training Two')],
  saving: false
};

describe('SaveComparisonDialog', () => {
  it('renders a checkbox row per training', () => {
    render(<SaveComparisonDialog {...baseProps} />);
    expect(screen.getByText('Training One')).toBeInTheDocument();
    expect(screen.getByText('Training Two')).toBeInTheDocument();
  });

  it('shows "No training data available" when comparisonData is empty', () => {
    render(<SaveComparisonDialog {...baseProps} comparisonData={[]} />);
    expect(screen.getByText('No training data available')).toBeInTheDocument();
  });

  it('calls handleTrainingIdToggle when a checkbox is clicked', () => {
    const handleTrainingIdToggle = vi.fn();
    render(<SaveComparisonDialog {...baseProps} handleTrainingIdToggle={handleTrainingIdToggle} />);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(handleTrainingIdToggle).toHaveBeenCalledWith('t2');
  });

  it('disables Save button when name is blank', () => {
    render(<SaveComparisonDialog {...baseProps} comparisonName="" />);
    expect(screen.getByRole('button', { name: /Save Comparison/i })).toBeDisabled();
  });

  it('disables Save button when no trainings selected', () => {
    render(<SaveComparisonDialog {...baseProps} selectedTrainingIds={[]} />);
    expect(screen.getByRole('button', { name: /Save Comparison/i })).toBeDisabled();
  });

  it('calls onSave when Save button clicked and enabled', () => {
    const onSave = vi.fn();
    render(<SaveComparisonDialog {...baseProps} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Save Comparison/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it('shows "Saving..." and disables inputs while saving', () => {
    render(<SaveComparisonDialog {...baseProps} saving />);
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByLabelText(/Comparison Name/)).toBeDisabled();
  });
});
