import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DeleteAnalysisDialog from './DeleteAnalysisDialog';

describe('DeleteAnalysisDialog', () => {
  it('confirms and cancels', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<DeleteAnalysisDialog open loading={false} onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner and disables Delete while loading', () => {
    render(<DeleteAnalysisDialog open loading onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<DeleteAnalysisDialog open={false} loading={false} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByText('Delete Analysis')).not.toBeInTheDocument();
  });
});
