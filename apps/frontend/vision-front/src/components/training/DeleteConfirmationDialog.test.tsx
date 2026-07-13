import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';

describe('DeleteConfirmationDialog', () => {
  it('renders the title and message', () => {
    render(
      <DeleteConfirmationDialog open onClose={vi.fn()} onConfirm={vi.fn()} title="Delete X" message="Are you sure?" />
    );

    expect(screen.getByText('Delete X')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('calls onConfirm and onClose', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteConfirmationDialog open onClose={onClose} onConfirm={onConfirm} title="t" message="m" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "Deleting..." and disables the confirm button while deleting', () => {
    render(
      <DeleteConfirmationDialog open onClose={vi.fn()} onConfirm={vi.fn()} title="t" message="m" isDeleting />
    );

    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });
});
