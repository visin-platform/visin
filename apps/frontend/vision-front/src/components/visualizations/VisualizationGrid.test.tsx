import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VisualizationGrid from './VisualizationGrid';
import { Visualization } from '../../types';

const makeViz = (overrides: Partial<Visualization> = {}): Visualization => ({
  _id: 'v1',
  epoch_uuid: 'e1',
  visualization_uuid: 'viz-1',
  filename: 'file1.png',
  type: 'segment',
  fileId: 'file1',
  uploadedAt: '2024-01-01T00:00:00.000Z',
  epoch: 1,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides
});

function baseProps(overrides: Partial<React.ComponentProps<typeof VisualizationGrid>> = {}) {
  return {
    visualizations: [makeViz()],
    selectedForCompare: [],
    handleCompareToggle: vi.fn(),
    handleImageClick: vi.fn(),
    handleDelete: vi.fn(),
    isAuthenticated: true,
    ...overrides
  };
}

describe('VisualizationGrid', () => {
  it('groups visualizations by type and epoch and renders headers', () => {
    const items = [makeViz(), makeViz({ _id: 'v2', visualization_uuid: 'viz-2', type: 'overlay', epoch: 2, filename: 'file2.png' })];
    render(<VisualizationGrid {...baseProps({ visualizations: items })} />);
    expect(screen.getByText('segment')).toBeInTheDocument();
    expect(screen.getByText('overlay')).toBeInTheDocument();
    expect(screen.getByText('file1.png')).toBeInTheDocument();
    expect(screen.getByText('file2.png')).toBeInTheDocument();
  });

  it('calls handleImageClick when the image is clicked', () => {
    const handleImageClick = vi.fn();
    render(<VisualizationGrid {...baseProps({ handleImageClick })} />);
    fireEvent.click(screen.getByRole('img'));
    expect(handleImageClick).toHaveBeenCalledWith(expect.objectContaining({ visualization_uuid: 'viz-1' }));
  });

  it('calls handleCompareToggle and shows "Selected" when the item is already selected', () => {
    const handleCompareToggle = vi.fn();
    const item = makeViz();
    render(<VisualizationGrid {...baseProps({ handleCompareToggle, selectedForCompare: [item] })} />);
    expect(screen.getByText('Selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Selected'));
    expect(handleCompareToggle).toHaveBeenCalledWith(expect.objectContaining({ visualization_uuid: 'viz-1' }));
  });

  it('hides the delete button when not authenticated', () => {
    render(<VisualizationGrid {...baseProps({ isAuthenticated: false })} />);
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  describe('delete confirmation', () => {
    it('calls handleDelete when delete is confirmed', () => {
      const handleDelete = vi.fn();
      render(<VisualizationGrid {...baseProps({ handleDelete })} />);
      fireEvent.click(screen.getByTestId('DeleteIcon'));
      expect(screen.getByText('Delete Visualization')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      expect(handleDelete).toHaveBeenCalledWith('viz-1');
    });
  });

  it('does not call handleDelete when the confirmation is cancelled', () => {
    const handleDelete = vi.fn();
    render(<VisualizationGrid {...baseProps({ handleDelete })} />);
    fireEvent.click(screen.getByTestId('DeleteIcon'));
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(handleDelete).not.toHaveBeenCalled();
  });
});
