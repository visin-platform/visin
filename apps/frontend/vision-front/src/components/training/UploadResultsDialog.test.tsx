import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import UploadResultsDialog from './UploadResultsDialog';

describe('UploadResultsDialog', () => {
  it('lists successful uploads with their operation', () => {
    render(
      <UploadResultsDialog
        open
        onClose={vi.fn()}
        results={{ successful: [{ name: 'a.json', operation: 'created' }], failed: [] }}
      />
    );

    expect(screen.getByText('Successfully Processed (1)')).toBeInTheDocument();
    expect(screen.getByText('a.json')).toBeInTheDocument();
    expect(screen.getByText('(created)')).toBeInTheDocument();
  });

  it('lists failed uploads with their error', () => {
    render(
      <UploadResultsDialog
        open
        onClose={vi.fn()}
        results={{ successful: [], failed: [{ name: 'b.json', error: 'Invalid format' }] }}
      />
    );

    expect(screen.getByText('Failed to Process (1)')).toBeInTheDocument();
    expect(screen.getByText('b.json')).toBeInTheDocument();
    expect(screen.getByText('Invalid format')).toBeInTheDocument();
  });

  it('shows neither section when both lists are empty', () => {
    render(<UploadResultsDialog open onClose={vi.fn()} results={{ successful: [], failed: [] }} />);

    expect(screen.queryByText(/Successfully Processed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to Process/)).not.toBeInTheDocument();
  });

  it('calls onClose', () => {
    const onClose = vi.fn();
    render(<UploadResultsDialog open onClose={onClose} results={{ successful: [], failed: [] }} />);

    screen.getByRole('button', { name: 'Close' }).click();

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
