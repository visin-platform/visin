import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config } = vi.hoisted(() => ({ config: {} as Record<string, string | undefined> }));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/exploreApi')>()),
  exploreApi: { searchPeople: vi.fn(), searchGroups: vi.fn(), publicProjects: vi.fn(), publicDatasets: vi.fn() },
}));

import { SearchPage } from './SearchPage';
import { exploreApi } from '../services/exploreApi';

const api = vi.mocked(exploreApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const people = [
  { id: 'u1', handle: 'ann-lee', name: 'Ann Lee', picture: 'https://p.test/ann.jpg' },
  { id: 'u2', handle: 'annan', name: 'Bob Annan' },
];
const groups = [
  { id: 'g1', handle: 'road-lab', name: 'Road lab', description: 'Segmentation' },
  { id: 'g2', handle: 'road-two', name: 'Road two' },
];
const projectRow = { _id: 'p1', name: 'Window ablations', slug: 'window-ablations', visibility: 'public' as const, owner: { kind: 'user' as const, id: 'u1' }, updatedAt: hoursAgo(3) };
const datasetRow = { _id: 'd1', name: 'Harbour frames', visibility: 'public' as const, owner: { kind: 'user' as const, id: 'u1' }, imageCount: 12, groups: [], updatedAt: hoursAgo(5) };
const pagination = { page: 1, limit: 6, total: 1, pages: 1 };

const Where = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
};
const renderAt = (path = '/search?q=ann') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <SearchPage now={now} />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, {
    AUTH_SERVICE_URL: 'https://auth.test',
    GROUP_SERVICE_URL: 'https://group.test',
    VISION_API_URL: 'https://vision.test',
    DATASET_API_URL: 'https://dataset.test',
  });
  api.searchPeople.mockResolvedValue(people);
  api.searchGroups.mockResolvedValue(groups);
  api.publicProjects.mockResolvedValue({ projects: [projectRow], pagination });
  api.publicDatasets.mockResolvedValue({ datasets: [datasetRow], pagination });
});

describe('SearchPage', () => {
  it('finds people, groups, projects and datasets for the same words, each in its own place', async () => {
    renderAt();

    const person = await screen.findByRole('link', { name: /Ann Lee/ });
    expect(person).toHaveAttribute('href', '/u/ann-lee');
    expect(within(person).getByText('@ann-lee')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bob Annan/ })).toHaveAttribute('href', '/u/annan');
    const group = screen.getByRole('link', { name: /Road lab/ });
    expect(group).toHaveAttribute('href', '/g/road-lab');
    expect(within(group).getByText('@road-lab · Segmentation')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Road two/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Window ablations' })).toHaveAttribute('href', '/projects/window-ablations');
    expect(await screen.findByRole('link', { name: 'Harbour frames' })).toHaveAttribute('href', '/datasets/d1');
  });

  it('asks each service for the words, a handful of results at a time', async () => {
    renderAt('/search?q=%20ann%20');

    await screen.findByRole('link', { name: /Ann Lee/ });
    expect(api.searchPeople).toHaveBeenCalledWith('ann', 6);
    expect(api.searchGroups).toHaveBeenCalledWith('ann', 6);
    expect(api.publicProjects).toHaveBeenCalledWith({ search: 'ann', sort: 'updated', page: 1, limit: 6 });
    expect(api.publicDatasets).toHaveBeenCalledWith({ search: 'ann', page: 1, limit: 6 });
  });

  it('offers See all, to the filtered Explore, only where a full handful came back', async () => {
    api.publicProjects.mockResolvedValue({ projects: Array.from({ length: 6 }, (_, index) => ({ ...projectRow, _id: `p${index}`, name: `Project ${index}` })), pagination });
    renderAt();

    expect(await screen.findByRole('link', { name: 'See all projects' })).toHaveAttribute('href', '/explore?q=ann&type=projects');
    expect(screen.queryByRole('link', { name: 'See all datasets' })).not.toBeInTheDocument();
  });

  it('says what matched nothing, kind by kind', async () => {
    api.searchPeople.mockResolvedValue([]);
    api.searchGroups.mockResolvedValue([]);
    api.publicProjects.mockResolvedValue({ projects: [], pagination });
    api.publicDatasets.mockResolvedValue({ datasets: [], pagination });
    renderAt();

    expect(await screen.findByText('No people match “ann”.')).toBeInTheDocument();
    expect(screen.getByText('No groups match “ann”.')).toBeInTheDocument();
    expect(await screen.findByText('No public projects match “ann”.')).toBeInTheDocument();
    expect(await screen.findByText('No public datasets match “ann”.')).toBeInTheDocument();
  });

  it('says what failed without taking the other kinds down', async () => {
    api.searchPeople.mockRejectedValue(new Error('down'));
    api.publicProjects.mockRejectedValue(new Error('down'));
    renderAt();

    expect(await screen.findByText('Could not search people.')).toBeInTheDocument();
    expect(await screen.findByText('Could not search projects.')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Road lab/ })).toBeInTheDocument();
  });

  it('asks nothing of anyone for less than two characters, and says so', async () => {
    renderAt('/search?q=a');

    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();
    expect(api.searchPeople).not.toHaveBeenCalled();
    expect(api.publicProjects).not.toHaveBeenCalled();
  });

  it('invites a search when there is nothing yet to look for', () => {
    renderAt('/search');

    expect(screen.getByText('Search for people, groups, projects and datasets.')).toBeInTheDocument();
    expect(api.searchPeople).not.toHaveBeenCalled();
  });

  it('searches again from its own box, keeping the words in the address', async () => {
    renderAt();
    await screen.findByRole('link', { name: /Ann Lee/ });

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Visin' }), { target: { value: ' road ' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(screen.getByTestId('where')).toHaveTextContent('/search?q=road');
    await screen.findByText('Road lab');
    expect(api.searchGroups).toHaveBeenLastCalledWith('road', 6);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Visin' }), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByTestId('where')).toHaveTextContent(/^\/search$/);
  });

  it('looks only where a service is configured, and says so when none is', async () => {
    delete config.AUTH_SERVICE_URL;
    delete config.GROUP_SERVICE_URL;
    renderAt();

    await screen.findByRole('link', { name: 'Window ablations' });
    expect(api.searchPeople).not.toHaveBeenCalled();
    expect(api.searchGroups).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'People' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Groups' })).not.toBeInTheDocument();
  });

  it('has nothing to search where no service is configured', () => {
    for (const key of Object.keys(config)) delete config[key];
    renderAt();

    expect(screen.getByText('Nothing to search here yet.')).toBeInTheDocument();
  });
});
