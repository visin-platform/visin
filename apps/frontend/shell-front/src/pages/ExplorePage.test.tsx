import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config, authState } = vi.hoisted(() => ({
  config: {} as Record<string, string | undefined>,
  authState: { isAuthenticated: false, isLoading: false, signup: vi.fn() },
}));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/exploreApi')>()),
  exploreApi: { publicProjects: vi.fn(), publicDatasets: vi.fn(), publicFindings: vi.fn(), leaderboard: vi.fn() },
}));

import { ExplorePage } from './ExplorePage';
import { exploreApi, type ExploreProject, type Pagination } from '../services/exploreApi';

const api = vi.mocked(exploreApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const projects: ExploreProject[] = [
  {
    _id: 'p1',
    name: 'Window ablations',
    slug: 'window-ablations',
    description: 'Swin window size study',
    visibility: 'public',
    owner: { kind: 'user', id: 'u9', name: 'Ann Lee', handle: 'ann-lee', picture: 'https://p.test/ann.jpg' },
    updatedAt: hoursAgo(3),
    runs: 9,
    lastRunAt: hoursAgo(5),
  },
  { _id: 'p2', name: 'Night driving', visibility: 'public', owner: { kind: 'user', id: 'u1' }, updatedAt: hoursAgo(96), lastActivityAt: hoursAgo(48), runs: 0 },
];
const datasets = [
  {
    _id: 'd1',
    name: 'Harbour frames',
    visibility: 'public' as const,
    owner: { kind: 'user' as const, id: 'u1' },
    imageCount: 4110,
    groups: [{ name: 'train', images: 4000 }],
    coverUrl: 'https://files.test/cover.jpg',
    updatedAt: hoursAgo(24),
  },
];
const leaderboard = {
  metric: 'mean_iou',
  direction: 'max' as const,
  entries: [
    { rank: 1, evaluationId: 'e1', checkpoint: { kind: 'local' as const, label: 'segformer-b2' }, project: { name: 'Window ablations' }, value: 0.8123, verified: true },
  ],
};
const findings = [
  {
    id: 'f1',
    title: 'window16 wins by a hair',
    authorKind: 'assistant' as const,
    authorLabel: 'Claude',
    createdAt: hoursAgo(2),
    project: { id: 'p1', name: 'Window ablations', slug: 'window-ablations' },
  },
];

const page = (number: number, pages: number, total: number, limit = 12): Pagination => ({ page: number, limit, total, pages });
const projectPage = (rows: ExploreProject[], number = 1, pages = 1) => ({ projects: rows, pagination: page(number, pages, rows.length) });
const datasetPage = (rows: typeof datasets, number = 1, pages = 1) => ({ datasets: rows, pagination: page(number, pages, rows.length) });

const Where = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
};

const renderPage = (path = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ExplorePage now={now} />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, {
    VISION_API_URL: 'https://vision-api.test',
    DATASET_API_URL: 'https://dataset-api.test',
    LANDING_FRONT_URL: 'https://landing.test/',
  });
  Object.assign(authState, { isAuthenticated: false, isLoading: false });
  api.publicProjects.mockResolvedValue(projectPage(projects));
  api.publicDatasets.mockResolvedValue(datasetPage(datasets));
  api.leaderboard.mockResolvedValue(leaderboard);
  api.publicFindings.mockResolvedValue(findings);
});

describe('ExplorePage', () => {
  it('shows public projects and datasets as cards that open them', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Window ablations' });
    expect(link).toHaveAttribute('href', '/projects/window-ablations');
    expect(within(link.closest('article')!).getByText('Swin window size study')).toBeInTheDocument();
    // No slug: the id opens it.
    expect(screen.getByRole('link', { name: 'Night driving' })).toHaveAttribute('href', '/projects/p2');
    const dataset = screen.getByRole('link', { name: 'Harbour frames' });
    expect(dataset).toHaveAttribute('href', '/datasets/d1');
    expect(within(dataset.closest('article')!).getByText(/4,110 images · 1 group/)).toBeInTheDocument();
  });

  it('says how alive a project is: its runs and the last one, else when it was last edited', async () => {
    api.publicProjects.mockResolvedValue(
      projectPage([...projects, { ...projects[1], _id: 'p3', name: 'One run', runs: 1, lastRunAt: hoursAgo(1) }])
    );
    renderPage();

    const card = async (name: string) => (await screen.findByRole('link', { name })).closest('article')!;
    expect(within(await card('Window ablations')).getByText('9 runs · last run 5 hours ago')).toBeInTheDocument();
    expect(within(await card('One run')).getByText('1 run · last run 1 hour ago')).toBeInTheDocument();
    // No runs: when anything last happened in it, not when its settings were last edited (4 days ago).
    expect(within(await card('Night driving')).getByText(/^Updated 2 days ago/)).toBeInTheDocument();
  });

  it('asks for the public catalogue, never the member-aware lists, so nothing private mixes in', async () => {
    renderPage();

    await screen.findByText('Night driving');
    expect(api.publicProjects).toHaveBeenCalledWith({ search: '', sort: 'updated', page: 1, limit: 12 });
    expect(api.publicDatasets).toHaveBeenCalledWith({ search: '', page: 1, limit: 12 });
  });

  it('names a person who owns something, linking to their page; and nobody who is not shown', async () => {
    renderPage();

    const owner = await screen.findByRole('link', { name: 'Ann Lee, profile' });
    expect(owner).toHaveAttribute('href', '/u/ann-lee');
    // Its own link, not inside the card's: the card's link is the title.
    expect(owner.closest('a')).toBe(owner);
    const quiet = screen.getByRole('link', { name: 'Night driving' }).closest('article')!;
    expect(within(quiet).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /profile/ })).toHaveLength(1);
  });

  it("shows a group's name as plain text without a page, and links one with a page at /g", async () => {
    api.publicProjects.mockResolvedValue(
      projectPage([
        { ...projects[0], owner: { kind: 'group', id: 'g1', name: 'Road lab' } },
        { ...projects[1], owner: { kind: 'group', id: 'g2', name: 'Harbour team', handle: 'harbour' } },
      ])
    );
    renderPage();

    const plain = (await screen.findByRole('link', { name: 'Window ablations' })).closest('article')!;
    expect(within(plain).getByText('Road lab')).toBeInTheDocument();
    expect(within(plain).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Harbour team, profile' })).toHaveAttribute('href', '/g/harbour');
  });

  it('puts the best recorded results beside them, each opening its evaluation', async () => {
    renderPage();

    const row = await screen.findByRole('link', { name: /segformer-b2/ });
    expect(row).toHaveAttribute('href', '/evaluations/e1');
    expect(within(row).getByText(/mean_iou 0.8123 · verified · Window ablations/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all leaderboards' })).toHaveAttribute('href', '/leaderboards');
  });

  it('lists the latest findings of public projects, from the public findings call', async () => {
    renderPage();

    const row = await screen.findByRole('link', { name: /window16 wins by a hair/ });
    expect(row).toHaveAttribute('href', '/projects/p1?tab=analysis');
    expect(within(row).getByText(/AI · Claude · Window ablations/)).toBeInTheDocument();
    expect(api.publicFindings).toHaveBeenCalledWith(4);
  });

  describe('paging and "See all"', () => {
    const many = (count: number, prefix = 'Project') =>
      Array.from({ length: count }, (_, index) => ({ ...projects[1], _id: `${prefix}-${index}`, name: `${prefix} ${index}` }));

    it('shows a taste of each in All, with See all to its full list', async () => {
      api.publicProjects.mockResolvedValue(projectPage(many(12), 1, 3));
      renderPage();

      await screen.findByText('Project 0');
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6 + datasets.length);
      expect(screen.getByRole('link', { name: 'See all projects' })).toHaveAttribute('href', '/?type=projects');
      expect(screen.getByRole('link', { name: 'See all datasets' })).toHaveAttribute('href', '/?type=datasets');
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    });

    it('keeps the search in a See all link', async () => {
      renderPage('/?q=swin');

      expect(await screen.findByRole('link', { name: 'See all projects' })).toHaveAttribute('href', '/?q=swin&type=projects');
    });

    it('pages through one kind with Show more, until there is no more', async () => {
      api.publicProjects
        .mockResolvedValueOnce(projectPage(many(12, 'First'), 1, 2))
        .mockResolvedValueOnce(projectPage(many(3, 'Second'), 2, 2));
      renderPage('/?type=projects');

      await screen.findByText('First 0');
      expect(screen.queryByRole('link', { name: 'See all projects' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

      expect(await screen.findByText('Second 0')).toBeInTheDocument();
      expect(screen.getByText('First 11')).toBeInTheDocument();
      expect(api.publicProjects).toHaveBeenLastCalledWith({ search: '', sort: 'updated', page: 2, limit: 12 });
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument());
    });

    it('says it is loading while it fetches the next page', async () => {
      let release: (value: ReturnType<typeof projectPage>) => void = () => {};
      api.publicProjects
        .mockResolvedValueOnce(projectPage(many(12, 'First'), 1, 2))
        .mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
      renderPage('/?type=projects');

      await screen.findByText('First 0');
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

      expect(await screen.findByRole('button', { name: 'Loading…' })).toBeDisabled();
      release(projectPage(many(1, 'Last'), 2, 2));
      expect(await screen.findByText('Last 0')).toBeInTheDocument();
    });

    it('pages datasets the same way', async () => {
      api.publicDatasets
        .mockResolvedValueOnce({ datasets: [datasets[0]], pagination: page(1, 2, 2) })
        .mockResolvedValueOnce({ datasets: [{ ...datasets[0], _id: 'd2', name: 'Second set' }], pagination: page(2, 2, 2) });
      renderPage('/?type=datasets');

      await screen.findByText('Harbour frames');
      fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

      expect(await screen.findByText('Second set')).toBeInTheDocument();
    });
  });

  describe('filters kept in the address', () => {
    it('narrows to one kind from the chips', async () => {
      renderPage();
      await screen.findByText('Harbour frames');

      fireEvent.click(screen.getByRole('button', { name: 'Datasets' }));

      expect(screen.getByTestId('where')).toHaveTextContent('/?type=datasets');
      expect(screen.queryByRole('link', { name: 'Window ablations' })).not.toBeInTheDocument();
      expect(screen.getByText('Harbour frames')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Datasets' })).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/);
    });

    it('opens already narrowed from the address', async () => {
      renderPage('/?type=projects');

      expect(await screen.findByText('Night driving')).toBeInTheDocument();
      expect(screen.queryByText('Harbour frames')).not.toBeInTheDocument();
    });

    it('searches the catalogue after a pause in typing, and keeps the words in the address', async () => {
      renderPage();
      await screen.findByText('Night driving');
      api.publicProjects.mockResolvedValue(projectPage([projects[0]]));
      api.publicDatasets.mockResolvedValue(datasetPage([]));

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search the catalogue' }), { target: { value: ' swin ' } });

      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/?q=swin'));
      await waitFor(() => expect(api.publicProjects).toHaveBeenLastCalledWith({ search: 'swin', sort: 'updated', page: 1, limit: 12 }));
      expect(api.publicDatasets).toHaveBeenLastCalledWith({ search: 'swin', page: 1, limit: 12 });
      expect(await screen.findByText('No public datasets match “swin”.')).toBeInTheDocument();
    });

    it('opens on the search the address carries, shows it, and clears it', async () => {
      renderPage('/?q=swin');

      expect(await screen.findByRole('searchbox', { name: 'Search the catalogue' })).toHaveValue('swin');
      expect(api.publicProjects).toHaveBeenCalledWith(expect.objectContaining({ search: 'swin' }));

      fireEvent.change(screen.getByRole('searchbox', { name: 'Search the catalogue' }), { target: { value: '' } });
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    });

    it('orders projects by recent change or by newest, and says so in the address', async () => {
      renderPage();
      await screen.findByText('Night driving');

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sort projects' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Newest' }));

      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/?sort=created'));
      await waitFor(() => expect(api.publicProjects).toHaveBeenLastCalledWith({ search: '', sort: 'created', page: 1, limit: 12 }));

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sort projects' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Recently updated' }));
      await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
    });

    it('has no sort where only datasets are shown', async () => {
      renderPage('/?type=datasets');

      await screen.findByText('Harbour frames');
      expect(screen.queryByRole('combobox', { name: 'Sort projects' })).not.toBeInTheDocument();
    });

    it('ignores a sort or a kind it does not know', async () => {
      renderPage('/?sort=bogus&type=bogus');

      expect(await screen.findByText('Night driving')).toBeInTheDocument();
      expect(api.publicProjects).toHaveBeenCalledWith(expect.objectContaining({ sort: 'updated' }));
      expect(screen.getByText('Harbour frames')).toBeInTheDocument();
    });
  });

  it('says so when there is nothing public yet', async () => {
    api.publicProjects.mockResolvedValue(projectPage([]));
    api.publicDatasets.mockResolvedValue(datasetPage([]));
    renderPage();

    expect(await screen.findByText('No public projects yet.')).toBeInTheDocument();
    expect(screen.getByText('No public datasets yet.')).toBeInTheDocument();
  });

  it('says what failed without taking the rest of the page down', async () => {
    api.publicProjects.mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText('Could not load projects.')).toBeInTheDocument();
    expect(await screen.findByText('Harbour frames')).toBeInTheDocument();
  });

  it('shows only what the configured services can feed', async () => {
    delete config.VISION_API_URL;
    renderPage();

    await screen.findByText('Harbour frames');
    expect(api.publicProjects).not.toHaveBeenCalled();
    expect(api.leaderboard).not.toHaveBeenCalled();
    expect(api.publicFindings).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort projects' })).not.toBeInTheDocument();
  });

  it('says so when no service is configured at all', () => {
    delete config.VISION_API_URL;
    delete config.DATASET_API_URL;
    renderPage();

    expect(screen.getByText('Nothing to browse here yet.')).toBeInTheDocument();
  });

  it('leaves out datasets where that service is not configured', async () => {
    delete config.DATASET_API_URL;
    renderPage();

    await screen.findByText('Night driving');
    expect(api.publicDatasets).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Datasets' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Datasets' })).not.toBeInTheDocument();
  });

  describe('welcome banner', () => {
    it('greets a visitor, who can sign up from it', async () => {
      renderPage();

      const banner = await screen.findByRole('region', { name: 'About Visin' });
      fireEvent.click(within(banner).getByRole('button', { name: 'Sign up' }));

      expect(authState.signup).toHaveBeenCalledTimes(1);
      expect(within(banner).getByRole('link', { name: 'About' })).toHaveAttribute('href', 'https://landing.test/about');
    });

    it('stays dismissed in that browser', async () => {
      const { unmount } = renderPage();
      fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
      expect(screen.queryByRole('region', { name: 'About Visin' })).not.toBeInTheDocument();
      unmount();

      renderPage();
      await screen.findByText('Night driving');
      expect(screen.queryByRole('region', { name: 'About Visin' })).not.toBeInTheDocument();
    });

    it('is not shown to a member', async () => {
      authState.isAuthenticated = true;
      renderPage();

      await screen.findByText('Night driving');
      expect(screen.queryByRole('region', { name: 'About Visin' })).not.toBeInTheDocument();
    });

    it('waits for the session check, so a member never sees it flash', async () => {
      authState.isLoading = true;
      renderPage();

      await waitFor(() => expect(api.publicProjects).toHaveBeenCalled());
      expect(screen.queryByRole('region', { name: 'About Visin' })).not.toBeInTheDocument();
    });

    it('still shows, and still closes, where the browser will not store a choice', async () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      try {
        renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));

        expect(screen.queryByRole('region', { name: 'About Visin' })).not.toBeInTheDocument();
      } finally {
        getItem.mockRestore();
        setItem.mockRestore();
      }
    });

    it('has no About link without a landing address', async () => {
      delete config.LANDING_FRONT_URL;
      renderPage();

      const banner = await screen.findByRole('region', { name: 'About Visin' });
      expect(within(banner).queryByRole('link', { name: 'About' })).not.toBeInTheDocument();
    });
  });
});
