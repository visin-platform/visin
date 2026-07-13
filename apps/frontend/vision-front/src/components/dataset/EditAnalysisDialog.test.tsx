import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EditAnalysisDialog from './EditAnalysisDialog';

const baseProps = {
  open: true,
  loading: false,
  datasetName: 'My Dataset',
  onDatasetNameChange: vi.fn(),
  datasetSize: '1 GB',
  onDatasetSizeChange: vi.fn(),
  downloadUrl: 'http://dl',
  onDownloadUrlChange: vi.fn(),
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe('EditAnalysisDialog', () => {
  it('renders current values', () => {
    render(<EditAnalysisDialog {...baseProps} />);

    expect(screen.getByDisplayValue('My Dataset')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1 GB')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://dl')).toBeInTheDocument();
  });

  it('calls the change handlers for each field', () => {
    const onDatasetNameChange = vi.fn();
    const onDatasetSizeChange = vi.fn();
    const onDownloadUrlChange = vi.fn();
    render(
      <EditAnalysisDialog
        {...baseProps}
        onDatasetNameChange={onDatasetNameChange}
        onDatasetSizeChange={onDatasetSizeChange}
        onDownloadUrlChange={onDownloadUrlChange}
      />
    );

    fireEvent.change(screen.getByLabelText('Dataset Name'), { target: { value: 'New' } });
    expect(onDatasetNameChange).toHaveBeenCalledWith('New');

    fireEvent.change(screen.getByLabelText(/size/i), { target: { value: '2 GB' } });
    expect(onDatasetSizeChange).toHaveBeenCalledWith('2 GB');

    fireEvent.change(screen.getByLabelText(/download url/i), { target: { value: 'http://x' } });
    expect(onDownloadUrlChange).toHaveBeenCalledWith('http://x');
  });

  it('disables Update when the name is blank', () => {
    render(<EditAnalysisDialog {...baseProps} datasetName="  " />);

    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled();
  });

  it('calls onConfirm and onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<EditAnalysisDialog {...baseProps} onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables all fields and buttons while loading', () => {
    render(<EditAnalysisDialog {...baseProps} loading />);

    expect(screen.getByLabelText('Dataset Name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
