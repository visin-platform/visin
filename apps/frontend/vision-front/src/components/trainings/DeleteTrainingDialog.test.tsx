import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteTrainingDialog from './DeleteTrainingDialog';

describe('DeleteTrainingDialog', () => {
  it('does not render when closed', () => {
    render(<DeleteTrainingDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />);
    expect(screen.queryByText('Delete Training')).not.toBeInTheDocument();
  });

  it('renders confirmation text when open', () => {
    render(<DeleteTrainingDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />);
    expect(screen.getByText('Delete Training')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this training/)).toBeInTheDocument();
  });

  it('calls onClose and onConfirm from buttons', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DeleteTrainingDialog open={true} onClose={onClose} onConfirm={onConfirm} isDeleting={false} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Deleting... state and disables buttons', () => {
    render(<DeleteTrainingDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={true} />);
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });
});
