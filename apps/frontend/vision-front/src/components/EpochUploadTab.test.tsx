import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EpochUploadTab } from './EpochUploadTab';
import { epochService } from '../services/epochService';
import { Training, Epoch } from '../types';

vi.mock('../services/epochService', () => ({
  epochService: {
    getEpochsByTraining: vi.fn(),
    uploadEpoch: vi.fn(),
    deleteEpoch: vi.fn()
  }
}));

const mockedEpochService = vi.mocked(epochService);

const trainings: Training[] = [
  {
    _id: 't1',
    uuid: 'uuid-1',
    name: 'Training One',
    status: 'completed',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z'
  },
  {
    _id: 't2',
    uuid: 'uuid-2',
    name: 'Training Two',
    status: 'running',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z'
  }
];

const makeEpoch = (epoch: number): Epoch => ({
  _id: `e${epoch}`,
  trainingId: 't1',
  training_uuid: 'training-uuid-1',
  epoch_uuid: `epoch-uuid-${epoch}`,
  epoch,
  timestamp: '2026-01-01T10:00:00.000Z',
  results: {
    train: { loss: 0.5, mean_iou: 0.7 },
    val: { loss: 0.6, mean_iou: 0.65 }
  },
  learning_rate: 0.001,
  epoch_time: 30.5,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
});

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderComponent = (selectedTrainingId = 't1', onTrainingChange = vi.fn()) => {
  const qc = makeQueryClient();
  return {
    onTrainingChange,
    ...render(
      <QueryClientProvider client={qc}>
        <EpochUploadTab
          trainings={trainings}
          selectedTrainingId={selectedTrainingId}
          onTrainingChange={onTrainingChange}
        />
      </QueryClientProvider>
    )
  };
};

describe('EpochUploadTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch epochs when no training is selected', () => {
    renderComponent('');
    expect(mockedEpochService.getEpochsByTraining).not.toHaveBeenCalled();
    expect(screen.queryByText(/Epochs for/)).not.toBeInTheDocument();
  });

  it('renders empty state when the selected training has no epochs', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [], pagination: { page: 1, limit: 1000, total: 0, pages: 0 } }
    } as any);

    renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText(/No epochs uploaded for this training yet/)).toBeInTheDocument();
    });
  });

  it('renders a table of epochs when data is loaded', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [makeEpoch(1)], pagination: { page: 1, limit: 1000, total: 1, pages: 1 } }
    } as any);

    renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText('0.5000')).toBeInTheDocument();
    });
  });

  it('calls onTrainingChange when a different training is selected', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [], pagination: { page: 1, limit: 1000, total: 0, pages: 0 } }
    } as any);
    const { onTrainingChange } = renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText(/No epochs uploaded/)).toBeInTheDocument();
    });

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: 'Training Two' }));

    expect(onTrainingChange).toHaveBeenCalledWith('t2');
  });

  it('uploads a valid JSON file and shows a success message', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [], pagination: { page: 1, limit: 1000, total: 0, pages: 0 } }
    } as any);
    mockedEpochService.uploadEpoch.mockResolvedValue({ data: makeEpoch(1) } as any);

    const { container } = renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText(/No epochs uploaded/)).toBeInTheDocument();
    });

    const file = new File([JSON.stringify({ epoch: 1 })], 'epoch1.json', { type: 'application/json' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('1 epoch file(s) uploaded successfully!')).toBeInTheDocument();
    });
    expect(mockedEpochService.uploadEpoch).toHaveBeenCalledWith({ epoch: 1 }, 't1');
  });

  it('reports failed uploads for non-JSON files', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [], pagination: { page: 1, limit: 1000, total: 0, pages: 0 } }
    } as any);

    const { container } = renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText(/No epochs uploaded/)).toBeInTheDocument();
    });

    const file = new File(['not json'], 'notes.txt', { type: 'text/plain' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Failed to upload 1 file(s).')).toBeInTheDocument();
    });
  });

  it('opens the details dialog when viewing an epoch', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [makeEpoch(1)], pagination: { page: 1, limit: 1000, total: 1, pages: 1 } }
    } as any);

    renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText('0.5000')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /view details/i }));

    expect(screen.getByText('Epoch Details - Epoch 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  });

  it('deletes an epoch after confirming in the delete dialog', async () => {
    mockedEpochService.getEpochsByTraining.mockResolvedValue({
      data: { epochs: [makeEpoch(1)], pagination: { page: 1, limit: 1000, total: 1, pages: 1 } }
    } as any);
    mockedEpochService.deleteEpoch.mockResolvedValue({ data: undefined } as any);

    renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText('0.5000')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(screen.getByText(/Are you sure you want to delete Epoch 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(mockedEpochService.deleteEpoch).toHaveBeenCalledWith('e1');
    });
    await waitFor(() => {
      expect(screen.getByText('Epoch deleted successfully')).toBeInTheDocument();
    });
  });

  it('shows a load error when fetching epochs fails', async () => {
    mockedEpochService.getEpochsByTraining.mockRejectedValue(new Error('network down'));

    renderComponent('t1');

    await waitFor(() => {
      expect(screen.getByText('network down')).toBeInTheDocument();
    });
  });
});
