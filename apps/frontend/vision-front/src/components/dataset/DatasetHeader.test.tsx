import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DatasetHeader from './DatasetHeader';
import type { DatasetAnalysis } from '../../services/analysisService';

const analysis: DatasetAnalysis = { _id: 'a1', dataset: 'My Dataset', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };

describe('DatasetHeader', () => {
  it('renders the dataset name and image count', () => {
    render(<DatasetHeader analysis={analysis} imagesCount={5} isLoading={false} onRefresh={vi.fn()} onDelete={vi.fn()} canDelete />);

    expect(screen.getByText('My Dataset')).toBeInTheDocument();
    expect(screen.getByText('Dataset analysis with 5 images')).toBeInTheDocument();
  });

  it('calls onRefresh when clicked', () => {
    const onRefresh = vi.fn();
    render(<DatasetHeader analysis={analysis} imagesCount={0} isLoading={false} onRefresh={onRefresh} onDelete={vi.fn()} canDelete />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('hides the delete button when canDelete is false', () => {
    render(<DatasetHeader analysis={analysis} imagesCount={0} isLoading={false} onRefresh={vi.fn()} onDelete={vi.fn()} canDelete={false} />);

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('calls onDelete when clicked', () => {
    const onDelete = vi.fn();
    render(<DatasetHeader analysis={analysis} imagesCount={0} isLoading={false} onRefresh={vi.fn()} onDelete={onDelete} canDelete />);

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons while loading', () => {
    render(<DatasetHeader analysis={analysis} imagesCount={0} isLoading canDelete onRefresh={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });
});
