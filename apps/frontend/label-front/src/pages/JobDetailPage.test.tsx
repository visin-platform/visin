import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  getJob: vi.fn(),
  getJobStats: vi.fn(),
  listJobs: vi.fn(),
  transitionJob: vi.fn(),
  downloadExport: vi.fn(),
}));

import { downloadExport, getJob, getJobStats, listJobs, transitionJob } from '../services/jobService';
import JobDetailPage from './JobDetailPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedGetJob = getJob as ReturnType<typeof vi.fn>;
const mockedStats = getJobStats as ReturnType<typeof vi.fn>;
const mockedListJobs = listJobs as ReturnType<typeof vi.fn>;
const mockedTransition = transitionJob as ReturnType<typeof vi.fn>;
const mockedExport = downloadExport as ReturnType<typeof vi.fn>;

const job = (overrides: Record<string, unknown> = {}) => ({
  _id: 'j1',
  name: 'Mask check',
  status: 'active',
  taskType: 'mask_toggle',
  redundancy: 2,
  question: { prompt: 'Mark all incorrect masks' },
  tasksCount: 10,
  progress: { tasks: 10, completed: 4, answers: 12, myAnswers: 6 },
  ...overrides,
});

const stats = {
  tasks: 10,
  completed: 4,
  answers: 12,
  perUser: [{ userEmail: 'a@x.com', userName: 'Ann', answered: 7 }],
  perStratum: [
    { stratum: 'vehicle', tasks: 6, completed: 3 },
    { stratum: 'sign', tasks: 4, completed: 1 },
  ],
  agreement: 0.875,
};

const renderPage = () => renderWithProviders(<JobDetailPage />, { route: '/jobs/j1', path: '/jobs/:id' });

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetJob.mockResolvedValue(job());
  mockedStats.mockResolvedValue(stats);
  mockedListJobs.mockResolvedValue([]);
});

describe('JobDetailPage', () => {
  it('shows progress, stats, per-user and per-stratum tables', async () => {
    renderPage();

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.getByText(/4\/10 tasks complete/)).toBeInTheDocument();
    expect(await screen.findByText('Ann')).toBeInTheDocument();
    expect(screen.getByText('vehicle')).toBeInTheDocument();
    expect(screen.getByText(/87\.5%/)).toBeInTheDocument(); // agreement (K=2)
  });

  it('hides admin controls for plain workers but shows the labeling link', async () => {
    renderPage();

    expect(await screen.findByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work');
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export JSONL' })).not.toBeInTheDocument();
  });

  it('lets an admin pause and export', async () => {
    mockedListJobs.mockResolvedValue([{ _id: 'j1' }]);
    mockedTransition.mockResolvedValue(job({ status: 'paused' }));
    mockedExport.mockResolvedValue(undefined);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'pause'));

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(mockedExport).toHaveBeenCalledWith('j1', 'csv');
  });

  it('lets an admin activate a draft and surfaces transition errors', async () => {
    mockedGetJob.mockResolvedValue(job({ status: 'draft' }));
    mockedListJobs.mockResolvedValue([{ _id: 'j1' }]);
    mockedTransition.mockRejectedValue(new Error('Bundle is not ready'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));

    expect(await screen.findByText('Bundle is not ready')).toBeInTheDocument();
  });
});

describe('JobDetailPage transitions', () => {
  it('resume for paused jobs and archive', async () => {
    mockedGetJob.mockResolvedValue(job({ status: 'paused' }));
    mockedListJobs.mockResolvedValue([{ _id: 'j1' }]);
    mockedTransition.mockResolvedValue(job({ status: 'active' }));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Resume' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'resume'));

    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith('j1', 'archive'));
  });

  it('exports JSONL and surfaces export failures', async () => {
    mockedListJobs.mockResolvedValue([{ _id: 'j1' }]);
    mockedExport.mockRejectedValue(new Error('Export failed (500)'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Export JSONL' }));

    expect(mockedExport).toHaveBeenCalledWith('j1', 'jsonl');
    expect(await screen.findByText('Export failed (500)')).toBeInTheDocument();
  });
});
