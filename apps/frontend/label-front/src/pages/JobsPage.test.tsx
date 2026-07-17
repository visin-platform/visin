import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  listJobs: vi.fn(),
}));

import { listJobs } from '../services/jobService';
import JobsPage from './JobsPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedList = listJobs as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('JobsPage', () => {
  it('shows the empty state', async () => {
    mockedList.mockResolvedValue([]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('No labeling jobs yet')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('worker');
  });

  it('shows an error', async () => {
    mockedList.mockRejectedValue(new Error('nope'));
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('nope')).toBeInTheDocument();
  });

  it('lists active jobs with links to workbench and details', async () => {
    mockedList.mockResolvedValue([
      {
        _id: 'j1',
        name: 'Mask check',
        taskType: 'mask_toggle',
        tasksCount: 42,
        question: { prompt: 'Mark all incorrect masks' },
      },
    ]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText('mask verification')).toBeInTheDocument();
    expect(screen.getByText('42 tasks')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work')
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/jobs/j1');
  });
});
