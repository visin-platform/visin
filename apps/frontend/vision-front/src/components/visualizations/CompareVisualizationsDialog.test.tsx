import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompareVisualizationsDialog from './CompareVisualizationsDialog';
import { Visualization } from '../../types';

const viz = (overrides: Partial<Visualization> = {}): Visualization => ({
  _id: 'v1',
  epoch_uuid: 'e1',
  visualization_uuid: 'viz-1',
  filename: 'file1.png',
  type: 'segment',
  fileId: 'file1',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  signedUrl: 'https://example.com/file1.png',
  epoch: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

describe('CompareVisualizationsDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<CompareVisualizationsDialog open={false} onClose={vi.fn()} selectedForCompare={[viz()]} />);
    expect(screen.queryByText('Compare Visualizations')).not.toBeInTheDocument();
  });

  it('renders each selected visualization with type, epoch and filename', () => {
    const items = [viz(), viz({ _id: 'v2', visualization_uuid: 'viz-2', filename: 'file2.png', epoch: 2 })];
    render(<CompareVisualizationsDialog open={true} onClose={vi.fn()} selectedForCompare={items} />);
    expect(screen.getByText('Compare Visualizations')).toBeInTheDocument();
    expect(screen.getByText('file1.png')).toBeInTheDocument();
    expect(screen.getByText('file2.png')).toBeInTheDocument();
    expect(screen.getByText('Epoch 2')).toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    render(<CompareVisualizationsDialog open={true} onClose={onClose} selectedForCompare={[viz()]} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
