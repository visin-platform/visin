import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config } = vi.hoisted(() => ({ config: {} as Record<string, string | undefined> }));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/exploreApi')>()),
  exploreApi: { group: vi.fn(), projects: vi.fn(), datasets: vi.fn(), activity: vi.fn() },
}));

import { clearVisits, readVisits } from '@visin/frontend-core';
import { GroupProfilePage } from './GroupProfilePage';
import { exploreApi } from '../services/exploreApi';

const api = vi.mocked(exploreApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const lab = {
  id: 'g7',
  handle: 'road-lab',
  name: 'Road lab',
  description: 'Segmentation under bad weather',
  links: ['https://road-lab.example.test/', 'https://github.com/road-lab'],
  picture: 'https://group.example.test/api/public/avatars/g7?v=1',
  createdAt: '2025-03-02T10:00:00Z',
};
const owner = { kind: 'group' as const, id: 'g7', name: 'Road lab', handle: 'road-lab' };
const projects = [{ _id: 'p1', name: 'Window ablations', slug: 'window-ablations', visibility: 'public' as const, owner, updatedAt: hoursAgo(3) }];

const renderAt = (path = '/g/road-lab?tab=projects') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/g/:handle" element={<GroupProfilePage now={now} />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, { VISION_API_URL: 'https://vision-api.test', DATASET_API_URL: 'https://dataset-api.test' });
  api.group.mockResolvedValue(lab);
  api.projects.mockResolvedValue(projects);
  api.datasets.mockResolvedValue([]);
  api.activity.mockResolvedValue([
    { kind: 'project.created', at: hoursAgo(3), project: { id: 'p1', name: 'Window ablations', slug: 'window-ablations' } },
  ]);
});

describe('GroupProfilePage', () => {
  it('notes the group as visited once its page has loaded', async () => {
    clearVisits();
    renderAt();

    await screen.findByRole('heading', { level: 1, name: 'Road lab' });
    expect(readVisits()).toMatchObject([{ kind: 'group', id: 'g7', name: 'Road lab', path: '/g/road-lab' }]);
  });

  it('gives the page its own title, description and canonical for a search engine, and noindex where there is no group', async () => {
    const { unmount } = renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Road lab' });
    expect(document.title).toBe('Road lab (@road-lab) on Visin');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Segmentation under bad weather'
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${window.location.origin}/g/road-lab`
    );
    unmount();

    api.group.mockResolvedValue(null);
    renderAt('/g/nobody');
    await screen.findByRole('heading', { level: 1, name: 'No such group' });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  it('shows the group\'s picture and its own sites, with the platforms it knows by name', async () => {
    renderAt();

    await screen.findByRole('heading', { level: 1, name: 'Road lab' });
    expect(document.querySelector('img[src="https://group.example.test/api/public/avatars/g7?v=1"]')).not.toBeNull();
    const links = screen.getAllByRole('link', { name: /road-lab/ }).filter((link) => link.getAttribute('rel')?.includes('nofollow'));
    expect(links.map((link) => link.textContent)).toEqual(['road-lab.example.test', 'GitHub road-lab']);
    expect(links[1]).toHaveAttribute('href', 'https://github.com/road-lab');
  });

  it('shows the group as it describes itself, and nothing about who is in it', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { level: 1, name: 'Road lab' })).toBeInTheDocument();
    expect(screen.getByText('@road-lab')).toBeInTheDocument();
    expect(screen.getByText('Segmentation under bad weather')).toBeInTheDocument();
    expect(screen.getByText(/Group since March 2025/)).toBeInTheDocument();
    expect(api.group).toHaveBeenCalledWith('road-lab');
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it("lists the group's public projects, asked for by the group's id and not as a person's", async () => {
    renderAt();

    expect(await screen.findByRole('link', { name: 'Window ablations' })).toHaveAttribute('href', '/projects/window-ablations');
    expect(api.projects).toHaveBeenCalledWith({ owner: 'g7' });
  });

  it("opens on the group's activity, asked for by the group's id", async () => {
    renderAt('/g/road-lab');

    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(api.activity).toHaveBeenCalledWith({ owner: 'g7' });
  });

  it('says there is no such group for a handle with no public page', async () => {
    api.group.mockResolvedValue(null);
    renderAt('/g/nobody');

    expect(await screen.findByRole('heading', { level: 1, name: 'No such group' })).toBeInTheDocument();
    expect(api.projects).not.toHaveBeenCalled();
  });

  it('offers a retry when the page itself could not be read', async () => {
    api.group.mockRejectedValueOnce(new Error('down'));
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Road lab' })).toBeInTheDocument();
  });
});
