import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => ({ state: null })
  };
});

vi.mock('../services/epochService', () => ({
  epochService: {
    getEpochsByTraining: vi.fn(),
    uploadEpoch: vi.fn(),
    deleteEpoch: vi.fn()
  }
}));

vi.mock('../services/trainingService', () => ({
  trainingService: {
    getTrainings: vi.fn()
  }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

import EpochsPage from './EpochsPage';
import { epochService } from '../services/epochService';
import { trainingService } from '../services/trainingService';

const epochServiceMock = epochService as unknown as {
  getEpochsByTraining: ReturnType<typeof vi.fn>;
  uploadEpoch: ReturnType<typeof vi.fn>;
  deleteEpoch: ReturnType<typeof vi.fn>;
};
const trainingServiceMock = trainingService as unknown as { getTrainings: ReturnType<typeof vi.fn> };

const training1 = { _id: 't1', name: 'Training One' };
const training2 = { _id: 't2', name: 'Training Two' };

const epoch1 = {
  _id: 'e1',
  epoch: 1,
  epoch_uuid: 'euuid-1',
  learning_rate: 0.001,
  epoch_time: 12.34,
  timestamp: '2024-01-01T00:00:00.000Z',
  results: {
    train: { loss: 0.5, mean_iou: 0.6 },
    val: { loss: 0.4, mean_iou: 0.7 }
  }
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <EpochsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('EpochsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [training1, training2] } });
  });

  it('renders the training selector once trainings load', async () => {
    renderPage();

    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));

    fireEvent.mouseDown(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'Training One' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Training Two' })).toBeInTheDocument();
  });

  it('does not show the epochs table until a training is selected', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));

    expect(screen.queryByText(/Epochs for/)).not.toBeInTheDocument();
  });

  it('loads and renders epochs for the selected training', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [epoch1] } });

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));

    expect(await screen.findByText('0.5000')).toBeInTheDocument();
    expect(epochServiceMock.getEpochsByTraining).toHaveBeenCalledWith('t1', {
      limit: 1000,
      sortBy: 'epoch',
      order: 'asc'
    });
  });

  it('shows an empty message when the training has no epochs', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [] } });

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));

    await waitFor(() => {
      expect(screen.getByText('No epochs found for this training')).toBeInTheDocument();
    });
  });

  it('opens the epoch details dialog when the info icon is clicked', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [epoch1] } });

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));
    await screen.findByTestId('InfoIcon');

    fireEvent.click(screen.getByTestId('InfoIcon').closest('button')!);

    expect(screen.getByText('Epoch Details - Epoch 1')).toBeInTheDocument();
    expect(screen.getByText(/euuid-1/)).toBeInTheDocument();
  });

  it('opens the delete confirmation dialog and calls deleteEpoch on confirm', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [epoch1] } });
    epochServiceMock.deleteEpoch.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));
    await screen.findByTestId('DeleteIcon');

    fireEvent.click(screen.getByTestId('DeleteIcon').closest('button')!);
    expect(screen.getByText(/Are you sure you want to delete Epoch 1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(epochServiceMock.deleteEpoch).toHaveBeenCalledWith('e1');
    });
    await waitFor(() => {
      expect(screen.getByText('Epoch deleted successfully')).toBeInTheDocument();
    });
  });

  it('shows an error alert when the upload fails', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [] } });
    epochServiceMock.uploadEpoch.mockRejectedValue(new Error('bad json'));

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));
    await waitFor(() => expect(screen.getByText('No epochs found for this training')).toBeInTheDocument());

    const file = new File([JSON.stringify({ epoch: 1 })], 'epoch.json', { type: 'application/json' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('bad json')).toBeInTheDocument();
    });
  });

  it('shows a validation error when a non-JSON file is selected', async () => {
    epochServiceMock.getEpochsByTraining.mockResolvedValue({ data: { epochs: [] } });

    renderPage();
    await waitFor(() => expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-disabled', 'true'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByRole('option', { name: 'Training One' }));
    await waitFor(() => expect(screen.getByText('No epochs found for this training')).toBeInTheDocument());

    const file = new File(['not json'], 'epoch.txt', { type: 'text/plain' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('Please select a JSON file')).toBeInTheDocument();
    });
    expect(epochServiceMock.uploadEpoch).not.toHaveBeenCalled();
  });
});
