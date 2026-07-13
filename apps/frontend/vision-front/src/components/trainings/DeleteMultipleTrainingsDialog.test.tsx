import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteMultipleTrainingsDialog from './DeleteMultipleTrainingsDialog';

describe('DeleteMultipleTrainingsDialog', () => {
  it('does not render when closed', () => {
    render(
      <DeleteMultipleTrainingsDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} count={3} isDeleting={false} />
    );
    expect(screen.queryByText('Delete Selected Trainings')).not.toBeInTheDocument();
  });

  it('shows the count of trainings to delete', () => {
    render(
      <DeleteMultipleTrainingsDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} count={5} isDeleting={false} />
    );
    expect(screen.getByText('Are you sure you want to delete 5 training(s)? This action cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm and onClose from the respective buttons', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteMultipleTrainingsDialog open={true} onClose={onClose} onConfirm={onConfirm} count={2} isDeleting={false} />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Deleting... and disables buttons while isDeleting', () => {
    render(
      <DeleteMultipleTrainingsDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} count={2} isDeleting={true} />
    );
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
    expect(screen.getByText('Deleting...').closest('button')).toBeDisabled();
  });
});
