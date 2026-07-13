import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteProjectDialog from './DeleteProjectDialog';

describe('DeleteProjectDialog', () => {
  it('does not render when closed', () => {
    render(<DeleteProjectDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />);
    expect(screen.queryByText('Delete Project')).not.toBeInTheDocument();
  });

  it('renders warning text when open', () => {
    render(<DeleteProjectDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={false} />);
    expect(screen.getByText('Delete Project')).toBeInTheDocument();
    expect(screen.getByText(/All trainings, visualizations, and data/)).toBeInTheDocument();
  });

  it('calls onClose and onConfirm from buttons', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DeleteProjectDialog open={true} onClose={onClose} onConfirm={onConfirm} isDeleting={false} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Deleting... and disables the confirm button while deleting', () => {
    render(<DeleteProjectDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} isDeleting={true} />);
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Deleting...').closest('button')).toBeDisabled();
  });
});
