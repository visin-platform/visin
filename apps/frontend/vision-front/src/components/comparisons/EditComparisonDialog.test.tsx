import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditComparisonDialog from './EditComparisonDialog';
import { Comparison } from '@/types';

const comparison: Comparison = {
  _id: 'c1',
  uuid: 'uuid-1',
  name: 'My Comparison',
  type: 'trainings',
  itemIds: ['t1', 't2'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

function baseProps(overrides: Partial<React.ComponentProps<typeof EditComparisonDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    comparison,
    name: 'My Comparison',
    onNameChange: vi.fn(),
    description: '',
    onDescriptionChange: vi.fn(),
    selectedIds: ['t1'],
    onToggleId: vi.fn(),
    updating: false,
    loadingTrainings: false,
    trainingData: { t1: 'Training One', t2: 'Training Two' },
    ...overrides
  };
}

describe('EditComparisonDialog', () => {
  it('renders name field and training checkboxes with training names', () => {
    render(<EditComparisonDialog {...baseProps()} />);
    expect(screen.getByDisplayValue('My Comparison')).toBeInTheDocument();
    expect(screen.getByText('Training One')).toBeInTheDocument();
    expect(screen.getByText('Training Two')).toBeInTheDocument();
    expect(screen.getByText('Select items to include in comparison (1 selected):')).toBeInTheDocument();
  });

  it('shows loading indicator while training data loads', () => {
    render(<EditComparisonDialog {...baseProps({ loadingTrainings: true })} />);
    expect(screen.getByText('Loading training data...')).toBeInTheDocument();
    expect(screen.queryByText('Training One')).not.toBeInTheDocument();
  });

  it('calls onNameChange and onDescriptionChange on typing', () => {
    const onNameChange = vi.fn();
    const onDescriptionChange = vi.fn();
    render(<EditComparisonDialog {...baseProps({ onNameChange, onDescriptionChange })} />);

    fireEvent.change(screen.getByLabelText(/Comparison Name/), { target: { value: 'New Name' } });
    expect(onNameChange).toHaveBeenCalledWith('New Name');

    fireEvent.change(screen.getByLabelText('Description (optional)'), { target: { value: 'New Desc' } });
    expect(onDescriptionChange).toHaveBeenCalledWith('New Desc');
  });

  it('calls onToggleId when a checkbox is clicked', () => {
    const onToggleId = vi.fn();
    render(<EditComparisonDialog {...baseProps({ onToggleId })} />);
    fireEvent.click(screen.getByLabelText('Training Two'));
    expect(onToggleId).toHaveBeenCalledWith('t2');
  });

  it('disables the update button when name is empty or no items are selected', () => {
    const { rerender } = render(<EditComparisonDialog {...baseProps({ name: '' })} />);
    expect(screen.getByText('Update Comparison').closest('button')).toBeDisabled();

    rerender(<EditComparisonDialog {...baseProps({ selectedIds: [] })} />);
    expect(screen.getByText('Update Comparison').closest('button')).toBeDisabled();
  });

  it('shows Updating... and disables actions while updating', () => {
    render(<EditComparisonDialog {...baseProps({ updating: true })} />);
    expect(screen.getByText('Updating...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });

  it('calls onUpdate when Update Comparison is clicked', () => {
    const onUpdate = vi.fn();
    render(<EditComparisonDialog {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getByText('Update Comparison'));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
