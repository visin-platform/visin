import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config } = vi.hoisted(() => ({ config: {} as Record<string, string | undefined> }));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../services/homeApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/homeApi')>()),
  homeApi: { trainings: vi.fn(), projects: vi.fn(), jobs: vi.fn(), findings: vi.fn() },
}));

import { HomePage } from './HomePage';
import { homeApi } from '../services/homeApi';

const api = vi.mocked(homeApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const trainings = [
  { _id: 't1', name: 'Detector v2', projectId: 'p1', status: 'running' as const, updatedAt: hoursAgo(3) },
  { _id: 't2', name: 'Segmenter', status: 'failed' as const, updatedAt: hoursAgo(24) },
];
const projects = [
  { _id: 'p1', name: 'Harbour cameras', slug: 'harbour-cameras', isPublic: false, updatedAt: hoursAgo(5) },
  { _id: 'p2', name: 'Orchard drones', isPublic: true, updatedAt: hoursAgo(48) },
];
const jobs = [
  { _id: 'j1', name: 'Crate outlines', tasksCount: 100, progress: { tasks: 100, completed: 40 }, updatedAt: hoursAgo(1) },
  { _id: 'j2', name: 'Blossom masks', tasksCount: 20, updatedAt: hoursAgo(2) },
];
const findings = [
  {
    _id: 'f1',
    projectId: 'p1',
    trainingId: 't1',
    title: 'Augmentation helps small crates',
    authorKind: 'assistant' as const,
    authorLabel: 'Claude',
    createdAt: hoursAgo(2),
  },
  {
    _id: 'f2',
    projectId: 'p2',
    title: 'Night frames need their own split',
    authorKind: 'person' as const,
    authorLabel: 'Jane Doe',
    createdAt: hoursAgo(26),
  },
];

const renderHome = (userName: string | undefined = 'Jane Doe') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <HomePage userName={userName} now={now} />
      </MemoryRouter>
    </QueryClientProvider>
  );

const section = (name: string) => within(screen.getByRole('region', { name }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(config, {
    VISION_API_URL: 'https://vision-api.test',
    LABEL_SERVICE_URL: 'https://label-api.test',
    VISION_FRONT_URL: 'https://vision.test',
    LABEL_FRONT_URL: 'https://label.test',
  });
  api.trainings.mockImplementation(async ({ status }) =>
    status === 'running' ? { trainings: [trainings[0]], total: 1 } : { trainings, total: 12 }
  );
  api.projects.mockResolvedValue(projects);
  api.jobs.mockResolvedValue(jobs);
  api.findings.mockResolvedValue(findings);
});

describe('HomePage', () => {
  it('greets the viewer by first name under the date', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: 'Good evening, Jane' })).toBeInTheDocument();
    expect(
      screen.getByText(now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))
    ).toBeInTheDocument();
  });

  it('welcomes a viewer with no name', () => {
    renderHome('');

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome to Visin' })).toBeInTheDocument();
  });

  it('offers one-tap shortcuts into the apps', () => {
    renderHome();

    const shortcuts = within(screen.getByRole('navigation', { name: 'Shortcuts' }));
    expect(shortcuts.getByRole('link', { name: 'Trainings' })).toHaveAttribute('href', '/trainings');
    expect(shortcuts.getByRole('link', { name: 'New job' })).toHaveAttribute('href', '/jobs/new');
  });

  it('sums up projects, trainings, running runs and the tasks left to label', async () => {
    renderHome();

    const summary = within(screen.getByRole('region', { name: 'Summary' }));
    const tile = (label: string) => summary.getByText(label).closest('a')!;
    await waitFor(() => {
      expect(tile('Projects')).toHaveTextContent('2');
      expect(tile('Trainings')).toHaveTextContent('12');
      expect(tile('Running now')).toHaveTextContent('1');
      // 60 left of the first job, all 20 of the second.
      expect(tile('Tasks to label')).toHaveTextContent('80');
    });
    expect(tile('Tasks to label')).toHaveAttribute('href', '/jobs');
  });

  it('lists recent trainings with their status, project and age', async () => {
    renderHome();

    const detector = await section('Recent trainings').findByRole('link', { name: /Detector v2/ });
    expect(detector).toHaveAttribute('href', '/trainings/t1');
    await waitFor(() => expect(detector).toHaveTextContent('Running · Harbour cameras · 3 hours ago'));
    expect(section('Recent trainings').getByRole('link', { name: /Segmenter/ })).toHaveTextContent(
      'Failed · yesterday'
    );
    expect(section('Recent trainings').getByRole('link', { name: 'See all trainings' })).toHaveAttribute(
      'href',
      '/trainings'
    );
  });

  it('lists projects, opened by slug where they have one', async () => {
    renderHome();

    const harbour = await section('Projects').findByRole('link', { name: /Harbour cameras/ });
    expect(harbour).toHaveAttribute('href', '/projects/harbour-cameras');
    expect(harbour).toHaveTextContent('Private · 5 hours ago');
    expect(section('Projects').getByRole('link', { name: /Orchard drones/ })).toHaveAttribute('href', '/projects/p2');
  });

  it('shows how far each active labeling job has got', async () => {
    renderHome();

    const crates = await section('Labeling').findByRole('link', { name: /Crate outlines/ });
    expect(crates).toHaveAttribute('href', '/jobs/j1');
    expect(crates).toHaveTextContent('40 of 100 tasks done');
    expect(within(crates).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(section('Labeling').getByRole('link', { name: /Blossom masks/ })).toHaveTextContent('0 of 20 tasks done');
  });

  it('lists recent analysis, saying who wrote it and opening where it is kept', async () => {
    renderHome();

    const crates = await section('Recent analysis').findByRole('link', { name: /Augmentation helps small crates/ });
    expect(crates).toHaveAttribute('href', '/trainings/t1');
    await waitFor(() => expect(crates).toHaveTextContent('AI · Claude · Harbour cameras · 2 hours ago'));

    const night = section('Recent analysis').getByRole('link', { name: /Night frames need their own split/ });
    expect(night).toHaveAttribute('href', '/projects/p2?tab=analysis');
    expect(night).toHaveTextContent('Jane Doe · Orchard drones · yesterday');
  });

  it('says so when there is nothing to list', async () => {
    api.trainings.mockResolvedValue({ trainings: [], total: 0 });
    renderHome();

    expect(await section('Recent trainings').findByText(/No trainings yet/)).toBeInTheDocument();
  });

  it('offers a retry where a section failed to load', async () => {
    api.projects.mockRejectedValueOnce(new Error('down'));
    renderHome();

    expect(await section('Projects').findByText('Could not load projects.')).toBeInTheDocument();
    fireEvent.click(section('Projects').getByRole('button', { name: 'Retry' }));

    expect(await section('Projects').findByRole('link', { name: /Harbour cameras/ })).toBeInTheDocument();
    expect(api.projects).toHaveBeenCalledTimes(2);
  });

  it('leaves out labeling where label-service is not configured', async () => {
    config.LABEL_SERVICE_URL = undefined;
    config.LABEL_FRONT_URL = undefined;
    renderHome();

    await section('Recent trainings').findByRole('link', { name: /Detector v2/ });
    expect(screen.queryByRole('region', { name: 'Labeling' })).not.toBeInTheDocument();
    expect(screen.queryByText('Tasks to label')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New job' })).not.toBeInTheDocument();
    expect(api.jobs).not.toHaveBeenCalled();
  });

  it('leaves out trainings and projects where vision-service is not configured', async () => {
    config.VISION_API_URL = undefined;
    renderHome();

    await section('Labeling').findByRole('link', { name: /Crate outlines/ });
    expect(screen.queryByRole('region', { name: 'Recent trainings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Projects' })).not.toBeInTheDocument();
    expect(api.trainings).not.toHaveBeenCalled();
  });
});
