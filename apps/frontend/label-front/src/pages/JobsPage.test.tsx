import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

vi.mock('../services/jobService', () => ({
  listJobs: vi.fn(),
}));
vi.mock('../services/datasetService', () => ({
  listDatasets: vi.fn(),
}));

// Signed in unless a test says otherwise — anonymous is the exception here.
const authState = { isAuthenticated: true, isLoading: false, user: { email: 'w@x.com' }, login: vi.fn(), logout: vi.fn() };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

import { listJobs } from '../services/jobService';
import { listDatasets } from '../services/datasetService';
import JobsPage from './JobsPage';
import { renderWithProviders } from '../test/renderWithProviders';

const mockedList = listJobs as ReturnType<typeof vi.fn>;
const mockedDatasets = listDatasets as ReturnType<typeof vi.fn>;
const managed = { _id: 'd1', name: 'Road', owner: { kind: 'group', id: 'g1' }, visibility: 'private', imageCount: 5, groups: [] };

const job = {
  _id: 'j1',
  name: 'Mask check',
  taskType: 'annotate',
  tasksCount: 42,
  redundancy: 1,
  description: 'Label the road scene',
  classes: [
    { key: 'car', name: 'Car', color: '#2a78d6', tools: ['box', 'mask'], maskIndex: 1 },
    { key: 'road', name: 'Road', color: '#eb6834', tools: ['mask'], maskIndex: 2 },
  ],
  sensors: [{ key: 'camera', group: 'camera', kind: 'image' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedDatasets.mockResolvedValue([]);
});

describe('JobsPage', () => {
  it('shows the empty state', async () => {
    mockedList.mockResolvedValue([]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('No labeling jobs yet')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('worker');
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();
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
    expect(screen.getByText('Boxes & masks')).toBeInTheDocument();
    expect(screen.getByText('42 frames')).toBeInTheDocument();
    expect(screen.getByText('Label the road scene')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/j1/work')
    );
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/jobs/j1');
  });

  it('shows how many frames are done', async () => {
    mockedList.mockResolvedValue([
      { ...job, progress: { tasks: 600, completed: 134, done: 134, skipped: 3, myDone: 87 } },
    ]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('134 / 600 frames done')).toBeInTheDocument();
    expect(screen.getByText(/22%/)).toBeInTheDocument();
    expect(screen.getByText(/you labeled 87/)).toBeInTheDocument();
    expect(screen.getByText(/3 skipped/)).toBeInTheDocument();
    expect(Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeCloseTo(22.3, 1);
  });

  it('names the class list when a job has no description, and what kinds of labels it takes', async () => {
    mockedList.mockResolvedValue([
      {
        ...job,
        description: undefined,
        classes: [{ key: 'sign', name: 'Sign', color: '#1baf7a', tools: ['box'], maskIndex: 1 }],
        sensors: [
          { key: 'camera', group: 'c', kind: 'image' },
          { key: 'lidar', group: 'l', kind: 'image' },
        ],
      },
      { ...job, _id: 'j2', name: 'Roads', classes: [{ key: 'road', name: 'Road', color: '#eb6834', tools: ['mask'], maskIndex: 1 }] },
    ]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('Boxes')).toBeInTheDocument();
    expect(screen.getByText('Sign')).toBeInTheDocument();
    expect(screen.getByText('camera + lidar')).toBeInTheDocument();
    expect(screen.getByText('Masks')).toBeInTheDocument();
  });

  it('omits the bar for a job whose tasks are not materialized yet', async () => {
    mockedList.mockResolvedValue([{ ...job, progress: { tasks: 0, completed: 0, done: 0, skipped: 0, myDone: 0 } }]);
    renderWithProviders(<JobsPage />);

    expect(await screen.findByText('Mask check')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('offers New job only to someone who manages a dataset with images', async () => {
    mockedList.mockResolvedValue([job]);
    renderWithProviders(<JobsPage />);
    await screen.findByText('Mask check');
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();

    mockedDatasets.mockResolvedValue([managed]);
    renderWithProviders(<JobsPage />);

    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'New job' })[0]).toHaveAttribute('href', '/jobs/new')
    );
  });

  it('offers New job from the empty state too', async () => {
    mockedList.mockResolvedValue([]);
    mockedDatasets.mockResolvedValue([managed]);
    renderWithProviders(<JobsPage />);

    await screen.findByText('No labeling jobs yet');
    // In the header and in the empty state itself, which says what a job is.
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'New job' })).toHaveLength(2));
    expect(screen.getByText(/asks people to draw boxes and masks/)).toBeInTheDocument();
  });

  it("shows a visitor the public jobs to browse, and never asks which datasets they manage", async () => {
    authState.isAuthenticated = false;
    try {
      mockedList.mockResolvedValue([job]);
      const { unmount } = renderWithProviders(<JobsPage />);
      expect(await screen.findByRole('link', { name: 'View frames' })).toBeInTheDocument();
      expect(screen.getByText(/Active labeling jobs\./)).toBeInTheDocument();
      unmount();

      mockedList.mockResolvedValue([]);
      renderWithProviders(<JobsPage />);
      expect(await screen.findByText('Active jobs will appear here.')).toBeInTheDocument();
      expect(mockedDatasets).not.toHaveBeenCalled();
    } finally {
      authState.isAuthenticated = true;
    }
  });
});
