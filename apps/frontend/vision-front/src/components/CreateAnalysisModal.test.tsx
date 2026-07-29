import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CreateAnalysisModal from './CreateAnalysisModal';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onCreate: vi.fn(),
  loading: false
};

describe('CreateAnalysisModal', () => {
  it('does not render when closed', () => {
    render(<CreateAnalysisModal {...baseProps} open={false} />);
    expect(screen.queryByText('Create New Dataset Analysis')).not.toBeInTheDocument();
  });

  it('renders the form when open', () => {
    render(<CreateAnalysisModal {...baseProps} />);
    expect(screen.getByText('Create New Dataset Analysis')).toBeInTheDocument();
  });

  it('disables submit and the storage path button while the name is empty', () => {
    render(<CreateAnalysisModal {...baseProps} />);
    expect(screen.getByRole('button', { name: /Create Analysis/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Use Storage Path/i })).toBeDisabled();
  });

  it('shows a validation error and does not call onCreate for a too-short name', async () => {
    const onCreate = vi.fn();
    render(<CreateAnalysisModal {...baseProps} onCreate={onCreate} />);
    await userEvent.type(screen.getByLabelText('Dataset Name'), 'a');
    await userEvent.click(screen.getByRole('button', { name: /Create Analysis/i }));
    expect(screen.getByText('Dataset name must be at least 2 characters')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('calls onCreate with the trimmed name, url, and size on submit', async () => {
    const onCreate = vi.fn();
    render(<CreateAnalysisModal {...baseProps} onCreate={onCreate} />);
    await userEvent.type(screen.getByLabelText('Dataset Name'), 'waymo');
    await userEvent.type(screen.getByLabelText('Size (optional)'), '1.2 GB');
    await userEvent.type(screen.getByLabelText('Download URL (optional)'), 'https://example.com/x.zip');
    await userEvent.click(screen.getByRole('button', { name: /Create Analysis/i }));
    expect(onCreate).toHaveBeenCalledWith('waymo', 'https://example.com/x.zip', '1.2 GB');
  });

  it('fills the path field when "Use Storage Path" is clicked', async () => {
    render(<CreateAnalysisModal {...baseProps} />);
    await userEvent.type(screen.getByLabelText('Dataset Name'), 'waymo');
    await userEvent.click(screen.getByRole('button', { name: /Use Storage Path/i }));
    expect(screen.getByLabelText('Download URL (optional)')).toHaveValue('datasets/waymo_dataset.zip');
  });

  it('resets fields and calls onClose when cancelled', async () => {
    const onClose = vi.fn();
    render(<CreateAnalysisModal {...baseProps} onClose={onClose} />);
    await userEvent.type(screen.getByLabelText('Dataset Name'), 'waymo');
    await userEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "Creating..." and disables inputs while loading', () => {
    render(<CreateAnalysisModal {...baseProps} loading />);
    expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled();
    expect(screen.getByLabelText('Dataset Name')).toBeDisabled();
  });
});
