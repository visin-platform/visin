import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EpochsUploadTab from './EpochsUploadTab';
import type { Epoch } from '../types';

const makeEpoch = (epoch: number, overrides: Partial<Epoch> = {}): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'uuid1',
  epoch_uuid: `epoch-${epoch}`,
  epoch,
  timestamp: '2024-01-01T00:00:00Z',
  results: {
    train: { loss: 0.5, mean_iou: 0.4 },
    val: { loss: 0.6, mean_iou: 0.5, vehicle: { iou: 0.7 } as any, sign: { iou: 0.6 } as any }
  },
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
  onFileChange: vi.fn(),
  onViewDetails: vi.fn(),
  onDelete: vi.fn()
};

describe('EpochsUploadTab', () => {
  it('shows the empty state when there are no epochs', () => {
    render(<EpochsUploadTab {...baseProps} />);
    expect(screen.getByText('No epochs uploaded yet. Upload an epoch JSON file to get started.')).toBeInTheDocument();
  });

  it('renders a table row per epoch with formatted metrics', () => {
    const epochs = [makeEpoch(1)];
    render(<EpochsUploadTab {...baseProps} epochs={epochs} />);
    expect(screen.getAllByText('0.5000').length).toBeGreaterThan(0);
    expect(screen.getByText('0.7000')).toBeInTheDocument();
  });

  it('shows "-" for missing per-class metrics', () => {
    const epochs = [makeEpoch(1, { results: { train: { loss: 0.5 } } })];
    render(<EpochsUploadTab {...baseProps} epochs={epochs} />);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('shows "Uploading..." and disables the button while uploading', () => {
    render(<EpochsUploadTab {...baseProps} uploading />);
    expect(screen.getByRole('button', { name: /Uploading.../i })).toBeDisabled();
  });

  it('displays the upload error and success alerts', () => {
    const { rerender } = render(<EpochsUploadTab {...baseProps} uploadError="Bad file" />);
    expect(screen.getByText('Bad file')).toBeInTheDocument();
    rerender(<EpochsUploadTab {...baseProps} uploadSuccess="Uploaded!" />);
    expect(screen.getByText('Uploaded!')).toBeInTheDocument();
  });

  it('calls onFileChange when a file is selected', () => {
    const onFileChange = vi.fn();
    const { container } = render(<EpochsUploadTab {...baseProps} onFileChange={onFileChange} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'epoch.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileChange).toHaveBeenCalledTimes(1);
  });

  it('calls onViewDetails and onDelete for the row actions', async () => {
    const onViewDetails = vi.fn();
    const onDelete = vi.fn();
    const epoch = makeEpoch(1);
    render(<EpochsUploadTab {...baseProps} epochs={[epoch]} onViewDetails={onViewDetails} onDelete={onDelete} />);
    await userEvent.click(screen.getByLabelText('View details'));
    expect(onViewDetails).toHaveBeenCalledWith(epoch);
    await userEvent.click(screen.getByLabelText('Delete'));
    expect(onDelete).toHaveBeenCalledWith(epoch);
  });
});
