import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteComparisonDialog from './DeleteComparisonDialog';

describe('DeleteComparisonDialog', () => {
  it('does not render when closed', () => {
    render(<DeleteComparisonDialog open={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByText('Delete Comparison')).not.toBeInTheDocument();
  });

  it('renders confirmation text when open', () => {
    render(<DeleteComparisonDialog open={true} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText('Delete Comparison')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete this comparison/)).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<DeleteComparisonDialog open={true} onClose={onClose} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when Delete is clicked', () => {
    const onConfirm = vi.fn();
    render(<DeleteComparisonDialog open={true} onClose={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
