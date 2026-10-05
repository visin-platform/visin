import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config, authState } = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  authState: { user: null as { id: string } | null },
}));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/exploreApi')>()),
  exploreApi: { user: vi.fn(), projects: vi.fn(), datasets: vi.fn(), activity: vi.fn() },
}));

import { clearVisits, readVisits } from '@visin/frontend-core';
import { ProfilePage } from './ProfilePage';
import { exploreApi } from '../services/exploreApi';

const api = vi.mocked(exploreApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const ann = {
  id: 'u9',
  handle: 'ann-lee',
  name: 'Ann Lee',
  picture: 'https://p.test/ann.jpg',
  bio: 'Segmentation under bad weather',
  links: ['https://ann.example.test/', 'https://github.com/ann-lee'],
  showActivity: true,
  createdAt: '2025-03-02T10:00:00Z',
};
const owner = { kind: 'user' as const, id: 'u9', name: 'Ann Lee', handle: 'ann-lee' };
const projects = [
  { _id: 'p1', name: 'Window ablations', slug: 'window-ablations', visibility: 'public' as const, owner, updatedAt: hoursAgo(3) },
];
const datasets = [
  { _id: 'd1', name: 'Harbour frames', visibility: 'public' as const, owner, imageCount: 12, groups: [], updatedAt: hoursAgo(5) },
];

const Where = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
};

const renderAt = (path = '/u/ann-lee?tab=projects') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/u/:handle" element={<ProfilePage now={now} />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, { VISION_API_URL: 'https://vision-api.test', DATASET_API_URL: 'https://dataset-api.test' });
  authState.user = null;
  api.user.mockResolvedValue(ann);
  api.projects.mockResolvedValue(projects);
  api.datasets.mockResolvedValue(datasets);
  api.activity.mockResolvedValue([
    { kind: 'project.created', at: hoursAgo(3), project: { id: 'p1', name: 'Window ablations', slug: 'window-ablations' } },
  ]);
});

describe('ProfilePage', () => {
  it('notes the person as visited once their page has loaded, and not for a page that is not there', async () => {
    clearVisits();
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Ann Lee' });
    expect(readVisits()).toMatchObject([{ kind: 'person', id: 'u9', name: 'Ann Lee', path: '/u/ann-lee' }]);

    clearVisits();
    api.user.mockResolvedValue(null);
    renderAt('/u/nobody');
    await screen.findByRole('heading', { level: 1, name: 'No such person' });
    expect(readVisits()).toEqual([]);
  });

  it('gives the page its own title, description and canonical for a search engine, and noindex where nobody is', async () => {
    const { unmount } = renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Ann Lee' });
    expect(document.title).toBe('Ann Lee (@ann-lee) on Visin');
    expect(document.head.querySelector('meta[name="description"]')).toHaveAttribute(
      'content',
      'Segmentation under bad weather'
    );
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${window.location.origin}/u/ann-lee`
    );
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    unmount();

    api.user.mockResolvedValue(null);
    renderAt('/u/nobody');
    await screen.findByRole('heading', { level: 1, name: 'No such person' });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  it('shows who the person is, as they wrote it', async () => {
    renderAt();

    expect(await screen.findByRole('heading', { level: 1, name: 'Ann Lee' })).toBeInTheDocument();
    expect(screen.getByText('@ann-lee')).toBeInTheDocument();
    expect(screen.getByText('Segmentation under bad weather')).toBeInTheDocument();
    expect(screen.getByText(/Joined March 2025/)).toBeInTheDocument();
    expect(api.user).toHaveBeenCalledWith('ann-lee');
  });

  it('opens their links in a new tab without a referrer, an opener or an endorsement', async () => {
    renderAt();

    const links = within(await screen.findByRole('list', { name: 'Links' })).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['ann.example.test', 'github.com/ann-lee']);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow ugc');
    }
    expect(links[1]).toHaveAttribute('href', 'https://github.com/ann-lee');
  });

  it('shows the plain address of a link it cannot read as one', async () => {
    api.user.mockResolvedValue({ ...ann, links: ['not a url'] });
    renderAt();

    expect(await screen.findByRole('link', { name: 'not a url' })).toBeInTheDocument();
  });

  it('lists their public projects, asking for exactly that person\'s', async () => {
    renderAt();

    const link = await screen.findByRole('link', { name: 'Window ablations' });
    expect(link).toHaveAttribute('href', '/projects/window-ablations');
    expect(api.projects).toHaveBeenCalledWith({ user: 'u9' });
    expect(screen.getByRole('button', { name: 'Projects 1' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to their datasets, keeping the tab in the address', async () => {
    renderAt();
    await screen.findByText('Window ablations');

    fireEvent.click(screen.getByRole('button', { name: /^Datasets/ }));

    expect(await screen.findByRole('link', { name: 'Harbour frames' })).toBeInTheDocument();
    expect(screen.queryByText('Window ablations')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/u/ann-lee?tab=datasets');
    expect(api.datasets).toHaveBeenCalledWith(48, { user: 'u9' });

    fireEvent.click(screen.getByRole('button', { name: /^Projects/ }));
    expect(await screen.findByText('Window ablations')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/u/ann-lee?tab=projects');
  });

  it('opens on the activity of the person, which is what they have been up to', async () => {
    renderAt('/u/ann-lee');

    expect(await screen.findByText('Today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-pressed', 'true');
    expect(api.activity).toHaveBeenCalledWith({ user: 'u9' });
  });

  it('has no activity tab for someone who keeps it to themselves, and opens on their projects', async () => {
    api.user.mockResolvedValue({ ...ann, showActivity: false });
    renderAt('/u/ann-lee');

    expect(await screen.findByRole('link', { name: 'Window ablations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument();
    expect(api.activity).not.toHaveBeenCalled();
    // Asking for the hidden tab by address gets the first one there is.
    expect(screen.getByRole('button', { name: /^Projects/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the tab the address asks for', async () => {
    renderAt('/u/ann-lee?tab=datasets');

    expect(await screen.findByText('Harbour frames')).toBeInTheDocument();
  });

  it('says when they have made nothing public yet', async () => {
    api.projects.mockResolvedValue([]);
    api.datasets.mockResolvedValue([]);
    renderAt();

    expect(await screen.findByText('No public projects yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Datasets/ }));
    expect(await screen.findByText('No public datasets yet.')).toBeInTheDocument();
  });

  it('says what failed to load, without losing the person', async () => {
    api.projects.mockRejectedValue(new Error('down'));
    renderAt();

    expect(await screen.findByText('Could not load projects.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Ann Lee' })).toBeInTheDocument();
  });

  it('offers the owner the way to edit their page, and nobody else', async () => {
    authState.user = { id: 'u9' };
    const { unmount } = renderAt();
    expect(await screen.findByRole('link', { name: 'Edit profile' })).toHaveAttribute('href', '/account/profile');
    unmount();

    authState.user = { id: 'someone-else' };
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Ann Lee' });
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument();
  });

  it('says there is nobody here for a handle with no public page', async () => {
    api.user.mockResolvedValue(null);
    renderAt('/u/nobody');

    expect(await screen.findByRole('heading', { level: 1, name: 'No such person' })).toBeInTheDocument();
    expect(api.projects).not.toHaveBeenCalled();
  });

  it('offers a retry when the page itself could not be read', async () => {
    api.user.mockRejectedValueOnce(new Error('down'));
    renderAt();

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Ann Lee' })).toBeInTheDocument();
  });

  it('lists only what the configured services can feed', async () => {
    delete config.DATASET_API_URL;
    renderAt();

    await screen.findByText('Window ablations');
    expect(api.datasets).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Datasets/ })).not.toBeInTheDocument();
  });

  it('shows no lists where no service is configured', async () => {
    delete config.VISION_API_URL;
    delete config.DATASET_API_URL;
    renderAt();

    await screen.findByRole('heading', { level: 1, name: 'Ann Lee' });
    expect(api.projects).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Show' })).not.toBeInTheDocument();
  });
});
