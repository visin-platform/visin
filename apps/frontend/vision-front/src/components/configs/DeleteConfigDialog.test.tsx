import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteConfigDialog from './DeleteConfigDialog';

describe('DeleteConfigDialog', () => {
  it('does not render when closed', () => {
    render(<DeleteConfigDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} loading={false} />);
    expect(screen.queryByText('Delete Config')).not.toBeInTheDocument();
  });

  it('renders confirmation text when open', () => {
    render(<DeleteConfigDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} loading={false} />);
    expect(screen.getByText('Delete Config')).toBeInTheDocument();
  });

  it('calls onClose and onConfirm from buttons', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DeleteConfigDialog open={true} onClose={onClose} onConfirm={onConfirm} loading={false} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Deleting... and disables buttons while loading', () => {
    render(<DeleteConfigDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} loading={true} />);
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByText('Cancel').closest('button')).toBeDisabled();
  });
});
