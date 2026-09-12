import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Training } from '../../types';

vi.mock('../../services/trainingService', () => ({
  trainingService: { getDeletedTrainings: vi.fn(), restoreTraining: vi.fn() }
}));

import { trainingService } from '../../services/trainingService';
import DeletedTrainings from './DeletedTrainings';

const mocked = vi.mocked(trainingService);

const run = (_id: string, name: string): Training => ({
  _id,
  uuid: `uuid-${_id}`,
  name,
  status: 'completed',
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-02T10:00:00.000Z',
  deletedAt: '2026-09-01T10:00:00.000Z'
});

const listing = (trainings: Training[], total = trainings.length) => ({
  success: true,
  data: { trainings, pagination: { page: 1, limit: 50, total, pages: Math.ceil(total / 50) } }
});

const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <DeletedTrainings />
    </QueryClientProvider>
  );
  return { invalidate };
};

const open = () => fireEvent.click(screen.getByText('Deleted trainings'));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeletedTrainings', () => {
  it('does not ask for deleted runs until opened', async () => {
    mocked.getDeletedTrainings.mockResolvedValue(listing([run('t1', 'Run A')]));
    renderPanel();
    expect(mocked.getDeletedTrainings).not.toHaveBeenCalled();

    open();

    expect(await screen.findByText('Run A')).toBeInTheDocument();
    expect(screen.getByText(/^Deleted \d{2}\.\d{2}\.2026/)).toBeInTheDocument();
    expect(mocked.getDeletedTrainings).toHaveBeenCalledWith({ limit: 50 });
  });

  it('says so when nothing is deleted', async () => {
    mocked.getDeletedTrainings.mockResolvedValue(listing([]));
    renderPanel();
    open();

    expect(await screen.findByText('No deleted trainings.')).toBeInTheDocument();
  });

  it('restores a run and refreshes the training lists', async () => {
    mocked.getDeletedTrainings.mockResolvedValueOnce(listing([run('t1', 'Run A')])).mockResolvedValue(listing([]));
    mocked.restoreTraining.mockResolvedValue({ success: true, data: run('t1', 'Run A') } as never);
    const { invalidate } = renderPanel();
    open();

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));

    await waitFor(() => expect(mocked.restoreTraining).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('No deleted trainings.')).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trainings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trainings-all'] });
  });

  it('shows why a restore failed and keeps the run listed', async () => {
    mocked.getDeletedTrainings.mockResolvedValue(listing([run('t1', 'Run A')]));
    mocked.restoreTraining.mockRejectedValue(new Error('Write permission is required for this resource'));
    renderPanel();
    open();

    fireEvent.click(await screen.findByRole('button', { name: /restore/i }));

    expect(await screen.findByText('Write permission is required for this resource')).toBeInTheDocument();
    expect(screen.getByText('Run A')).toBeInTheDocument();
  });

  it('says when only the most recent deletions are shown', async () => {
    mocked.getDeletedTrainings.mockResolvedValue(listing([run('t1', 'Run A')], 120));
    renderPanel();
    open();

    expect(await screen.findByText('Showing the 1 most recently deleted of 120.')).toBeInTheDocument();
  });
});
