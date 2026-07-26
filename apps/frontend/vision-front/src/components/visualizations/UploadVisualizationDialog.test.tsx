import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import UploadVisualizationDialog from './UploadVisualizationDialog';
import { Epoch } from '../../types';

const epochs: Epoch[] = [
  {
    _id: 'e1',
    trainingId: 't1',
    training_uuid: 'training-1',
    epoch_uuid: 'epoch-uuid-1',
    epoch: 1,
    timestamp: '2024-01-01T00:00:00.000Z',
    results: {},
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    _id: 'e2',
    trainingId: 't1',
    training_uuid: 'training-1',
    epoch_uuid: 'epoch-uuid-2',
    epoch: 2,
    timestamp: '2024-01-02T00:00:00.000Z',
    results: {},
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z'
  }
];

function baseProps(overrides: Partial<React.ComponentProps<typeof UploadVisualizationDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    epochs,
    onUpload: vi.fn().mockResolvedValue(true),
    uploading: false,
    ...overrides
  };
}

describe('UploadVisualizationDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<UploadVisualizationDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText('Upload Visualization')).not.toBeInTheDocument();
  });

  it('renders epoch options and default upload type', () => {
    render(<UploadVisualizationDialog {...baseProps()} />);
    expect(screen.getByText('Upload Visualization')).toBeInTheDocument();
    expect(screen.getByDisplayValue('segment')).toBeInTheDocument();
  });

  it('disables the Upload button until a file, epoch and type are selected', () => {
    render(<UploadVisualizationDialog {...baseProps()} />);
    expect(screen.getByText('Upload').closest('button')).toBeDisabled();
  });

  it('calls onUpload with the selected epoch, file and type, then closes on success', async () => {
    const onUpload = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<UploadVisualizationDialog {...baseProps({ onUpload, onClose })} />);

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Epoch 2'));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'photo.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    const uploadButton = screen.getByText('Upload').closest('button')!;
    expect(uploadButton).not.toBeDisabled();
    fireEvent.click(uploadButton);

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledWith('epoch-uuid-2', file, 'segment');
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('shows Uploading... label while uploading', () => {
    render(<UploadVisualizationDialog {...baseProps({ uploading: true })} />);
    expect(screen.getByText('Uploading...')).toBeInTheDocument();
  });

  it('calls onClose from Cancel button', () => {
    const onClose = vi.fn();
    render(<UploadVisualizationDialog {...baseProps({ onClose })} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
