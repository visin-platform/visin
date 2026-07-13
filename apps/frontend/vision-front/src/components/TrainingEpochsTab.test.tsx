import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrainingEpochsTab from './TrainingEpochsTab';
import type { Epoch } from '../types';

const makeEpoch = (epoch: number, overrides: Partial<Epoch> = {}): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results: { train: { loss: 0.5, mean_iou: 0.4 }, val: { loss: 0.6, mean_iou: 0.5 } },
  learning_rate: 0.001,
  epoch_time: 12.345,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  ...overrides
});

const baseProps = {
  epochs: [] as Epoch[],
  uploading: false,
  uploadError: null as string | null,
  uploadSuccess: null as string | null,
  deleteOpen: false,
  deleteTarget: null as Epoch | null,
  uploadResultsOpen: false,
  uploadResults: { successful: [], failed: [] },
  onFileUpload: vi.fn(async () => {}),
  onDeleteClick: vi.fn(),
  onConfirmDelete: vi.fn(async () => {}),
  onSetDeleteOpen: vi.fn(),
  onSetUploadResultsOpen: vi.fn(),
  isAuthenticated: true
};

describe('TrainingEpochsTab', () => {
  it('shows the empty state and an "Upload First Epoch" action when there are no epochs', () => {
    render(<TrainingEpochsTab {...baseProps} />);
    expect(screen.getByText('No epochs uploaded yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload First Epoch/i })).toBeInTheDocument();
  });

  it('renders a table row per epoch with formatted metrics', () => {
    const epochs = [makeEpoch(1)];
    render(<TrainingEpochsTab {...baseProps} epochs={epochs} />);
    expect(screen.getAllByText('0.5000').length).toBeGreaterThan(0);
    expect(screen.getByText('0.6000')).toBeInTheDocument();
  });

  it('shows "-" for missing numeric metrics', () => {
    const epochs = [makeEpoch(1, { results: {}, learning_rate: undefined, epoch_time: undefined })];
    render(<TrainingEpochsTab {...baseProps} epochs={epochs} />);
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('hides the upload button and delete icons when not authenticated', () => {
    const epochs = [makeEpoch(1)];
    render(<TrainingEpochsTab {...baseProps} epochs={epochs} isAuthenticated={false} />);
    expect(screen.queryByRole('button', { name: /Upload Epochs/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete Epoch')).not.toBeInTheDocument();
  });

  it('shows "Uploading..." on the upload button while uploading', () => {
    render(<TrainingEpochsTab {...baseProps} uploading />);
    expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled();
  });

  it('displays the upload error alert and opens results on "View Details"', async () => {
    const onSetUploadResultsOpen = vi.fn();
    render(<TrainingEpochsTab {...baseProps} uploadError="Something failed" onSetUploadResultsOpen={onSetUploadResultsOpen} />);
    expect(screen.getByText('Something failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /View Details/i }));
    expect(onSetUploadResultsOpen).toHaveBeenCalledWith(true);
  });

  it('displays the upload success alert', () => {
    render(<TrainingEpochsTab {...baseProps} uploadSuccess="All good" />);
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('calls onFileUpload when a file is selected via the hidden input', async () => {
    const onFileUpload = vi.fn(async () => {});
    const { container } = render(<TrainingEpochsTab {...baseProps} onFileUpload={onFileUpload} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'epoch.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileUpload).toHaveBeenCalledTimes(1);
  });

  it('calls onDeleteClick when the delete icon for an epoch is clicked', async () => {
    const onDeleteClick = vi.fn();
    const epoch = makeEpoch(1);
    render(<TrainingEpochsTab {...baseProps} epochs={[epoch]} onDeleteClick={onDeleteClick} />);
    await userEvent.click(screen.getByLabelText('Delete Epoch'));
    expect(onDeleteClick).toHaveBeenCalledWith(epoch);
  });

  it('passes the delete target name through to the confirmation dialog message', () => {
    const epoch = makeEpoch(7);
    render(<TrainingEpochsTab {...baseProps} deleteOpen deleteTarget={epoch} />);
    expect(screen.getByText(/Are you sure you want to delete Epoch 7\?/)).toBeInTheDocument();
  });
});
