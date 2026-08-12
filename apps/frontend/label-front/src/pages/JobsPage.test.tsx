import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  listJobs: vi.fn(),
  getMyGroups: vi.fn(),
}));

// Signed in unless a test says otherwise — anonymous is the exception here.
const authState = { isAuthenticated: true, isLoading: false, user: { email: 'w@x.com' }, login: vi.fn(), logout: vi.fn() };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { getMyGroups, listJobs } from '../services/jobService';
import JobsPage from './JobsPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedList = listJobs as ReturnType<typeof vi.fn>;
const mockedGroups = getMyGroups as ReturnType<typeof vi.fn>;

const job = {
  _id: 'j1',
  name: 'Mask check',
  taskType: 'mask_toggle',
  tasksCount: 42,
  redundancy: 1,
  question: { prompt: 'Mark all incorrect masks' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedGroups.mockResolvedValue([]);
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
    mockedList.mockResolvedValue([job]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText('mask verification')).toBeInTheDocument();
    expect(screen.getByText('42 tasks')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work')
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/jobs/j1');
  });

  it('shows how many frames are done', async () => {
    mockedList.mockResolvedValue([
      { ...job, progress: { tasks: 600, completed: 134, answers: 134, myAnswers: 87 } },
    ]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('134 / 600 frames done')).toBeInTheDocument();
    expect(screen.getByText(/22%/)).toBeInTheDocument();
    expect(screen.getByText(/you labeled 87/)).toBeInTheDocument();
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(22.3, 1);
  });

  // A K>1 job's answer count is not its frame count, so both are shown.
  it('reports collected labels separately when redundancy is above 1', async () => {
    mockedList.mockResolvedValue([
      { ...job, redundancy: 3, progress: { tasks: 100, completed: 20, answers: 140, myAnswers: 0 } },
    ]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('20 / 100 frames done')).toBeInTheDocument();
    expect(screen.getByText(/140 labels collected/)).toBeInTheDocument();
  });

  it('omits the bar for a job whose tasks are not materialized yet', async () => {
    mockedList.mockResolvedValue([{ ...job, progress: { tasks: 0, completed: 0, answers: 0, myAnswers: 0 } }]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('offers New job only to a group admin', async () => {
    mockedList.mockResolvedValue([job]);
    renderWithProviders(<JobsPage />);
    await screen.findByText('Mask check');
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();

    mockedGroups.mockResolvedValue([{ groupId: 'g1', name: 'G', role: 'admin' }]);
    renderWithProviders(<JobsPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'New job' })[0]).toHaveAttribute('href', '/jobs/new')
    );
  });

  it('offers New job from the empty state too', async () => {
    mockedList.mockResolvedValue([]);
    mockedGroups.mockResolvedValue([{ groupId: 'g1', name: 'G', role: 'owner' }]);
    renderWithProviders(<JobsPage />);

    await screen.findByText('No labeling jobs yet');
    await waitFor(() => expect(screen.getByRole('link', { name: 'New job' })).toBeInTheDocument());
  });
});
