import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditComparisonDialog from './EditComparisonDialog';
import type { Training } from '@/types';

const trainings: Training[] = [
  { _id: 't1', uuid: 'u1', name: 'Training One', status: 'completed', createdAt: '', updatedAt: '' }
];

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  editName: 'My Comparison',
  onEditNameChange: vi.fn(),
  editDescription: '',
  onEditDescriptionChange: vi.fn(),
  trainings,
  editSelectedIds: ['t1'],
  onTrainingToggle: vi.fn(),
  isTrainingsLoading: false,
  updating: false
};

describe('EditComparisonDialog', () => {
  it('renders title, name, and description fields', () => {
    render(<EditComparisonDialog {...baseProps} />);
    expect(screen.getByText('Edit Comparison')).toBeInTheDocument();
    expect(screen.getByDisplayValue('My Comparison')).toBeInTheDocument();
  });

  it('calls onEditNameChange when typing in the title field', () => {
    const onEditNameChange = vi.fn();
    render(<EditComparisonDialog {...baseProps} onEditNameChange={onEditNameChange} />);
    fireEvent.change(screen.getByLabelText('Comparison Title'), { target: { value: 'New Name' } });
    expect(onEditNameChange).toHaveBeenCalledWith('New Name');
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<EditComparisonDialog {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm when Update is clicked and enabled', () => {
    const onConfirm = vi.fn();
    render(<EditComparisonDialog {...baseProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Update'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables Update button when name is empty', () => {
    render(<EditComparisonDialog {...baseProps} editName="" />);
    expect(screen.getByText('Update').closest('button')).toBeDisabled();
  });

  it('disables Update button when no trainings are selected', () => {
    render(<EditComparisonDialog {...baseProps} editSelectedIds={[]} />);
    expect(screen.getByText('Update').closest('button')).toBeDisabled();
  });

  it('shows a spinner instead of "Update" text while updating', () => {
    render(<EditComparisonDialog {...baseProps} updating />);
    expect(screen.queryByText('Update')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
