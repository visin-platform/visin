import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteMultipleConfigsDialog from './DeleteMultipleConfigsDialog';

describe('DeleteMultipleConfigsDialog', () => {
  it('does not render when closed', () => {
    render(
      <DeleteMultipleConfigsDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} count={3} loading={false} />
    );
    expect(screen.queryByText('Delete Selected Configs')).not.toBeInTheDocument();
  });

  it('shows the count of configs to delete', () => {
    render(
      <DeleteMultipleConfigsDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} count={4} loading={false} />
    );
    expect(screen.getByText('Are you sure you want to delete 4 config(s)? This action cannot be undone.')).toBeInTheDocument();
  });

  it('calls onConfirm and onClose from buttons', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <DeleteMultipleConfigsDialog open={true} onClose={onClose} onConfirm={onConfirm} count={2} loading={false} />
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Deleting... state while loading', () => {
    render(
      <DeleteMultipleConfigsDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} count={2} loading={true} />
    );
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });
});
