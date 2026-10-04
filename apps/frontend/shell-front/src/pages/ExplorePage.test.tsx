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
  exploreApi: { projects: vi.fn(), datasets: vi.fn(), leaderboard: vi.fn() },
}));
vi.mock('../services/homeApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/homeApi')>()),
  homeApi: { findings: vi.fn() },
}));

import { ExplorePage } from './ExplorePage';
import { exploreApi } from '../services/exploreApi';
import { homeApi } from '../services/homeApi';

const explore = vi.mocked(exploreApi);
const home = vi.mocked(homeApi);
const now = new Date(2026, 8, 15, 20, 0);
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();

const projects = [
  {
    _id: 'p1',
    name: 'Window ablations',
    slug: 'window-ablations',
    description: 'Swin window size study',
    visibility: 'public' as const,
    owner: { kind: 'user' as const, id: 'u9', name: 'Ann Lee', handle: 'ann-lee', picture: 'https://p.test/ann.jpg' },
    updatedAt: hoursAgo(3),
  },
  {
    _id: 'p2',
    name: 'Night driving',
    visibility: 'public' as const,
    owner: { kind: 'user' as const, id: 'u1' },
    updatedAt: hoursAgo(48),
  },
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
    {
      rank: 1,
      evaluationId: 'e1',
      checkpoint: { kind: 'local' as const, label: 'segformer-b2' },
      project: { name: 'Window ablations' },
      value: 0.8123,
      verified: true,
    },
  ],
};
const findings = [
  {
    _id: 'f1',
    projectId: 'p1',
    title: 'window16 wins by a hair',
    authorKind: 'assistant' as const,
    authorLabel: 'Claude',
    createdAt: hoursAgo(2),
  },
  {
    _id: 'f2',
    projectId: 'private-one',
    title: 'A private conclusion',
    authorKind: 'person' as const,
    authorLabel: 'Ann',
    createdAt: hoursAgo(1),
  },
];

const Path = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="where">{pathname + search}</div>;
};

const renderPage = (path = '/') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <ExplorePage now={now} />
        <Path />
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
  explore.projects.mockResolvedValue(projects);
  explore.datasets.mockResolvedValue(datasets);
  explore.leaderboard.mockResolvedValue(leaderboard);
  home.findings.mockResolvedValue(findings);
});

describe('ExplorePage', () => {
  it('shows public projects and datasets as cards that open them', async () => {
    renderPage();

    const link = await screen.findByRole('link', { name: 'Window ablations' });
    expect(link).toHaveAttribute('href', '/projects/window-ablations');
    const project = within(link.closest('article')!);
    expect(project.getByText('Swin window size study')).toBeInTheDocument();
    expect(project.getByText(/Updated 3 hours ago/)).toBeInTheDocument();
    // No slug: the id opens it.
    expect(screen.getByRole('link', { name: 'Night driving' })).toHaveAttribute('href', '/projects/p2');
    const dataset = screen.getByRole('link', { name: 'Harbour frames' });
    expect(dataset).toHaveAttribute('href', '/datasets/d1');
    expect(within(dataset.closest('article')!).getByText(/4,110 images · 1 group/)).toBeInTheDocument();
  });

  it('names a person who owns something, linking to their page; and nobody who is not shown', async () => {
    renderPage();

    const owner = await screen.findByRole('link', { name: 'Ann Lee, profile' });
    expect(owner).toHaveAttribute('href', '/u/ann-lee');
    // Its own link, not inside the card's: the card's link is the title.
    expect(owner.closest('a')).toBe(owner);
    expect(within(owner).queryByText('Ann Lee')).toBeInTheDocument();
    const quiet = screen.getByRole('link', { name: 'Night driving' }).closest('article')!;
    expect(within(quiet).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /profile/ })).toHaveLength(1);
  });

  it('shows a group\'s name where the viewer is in it, as plain text', async () => {
    explore.projects.mockResolvedValue([{ ...projects[0], owner: { kind: 'group' as const, id: 'g1', name: 'Road lab' } }]);
    renderPage();

    const card = (await screen.findByRole('link', { name: 'Window ablations' })).closest('article')!;
    expect(within(card).getByText('Road lab')).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: /profile/ })).not.toBeInTheDocument();
  });

  it('shows a dataset without a cover as an icon, and counts one image in the singular', async () => {
    explore.datasets.mockResolvedValue([
      { ...datasets[0], _id: 'd2', name: 'Single frame', coverUrl: undefined, imageCount: 1, groups: [] },
    ]);
    renderPage();

    const card = (await screen.findByRole('link', { name: 'Single frame' })).closest('article')!;
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).getByText(/^1 image · /)).toBeInTheDocument();
    expect(within(card).queryByText(/group/)).not.toBeInTheDocument();
  });

  it('numbers the rows below the leader, and says which are verified', async () => {
    explore.leaderboard.mockResolvedValue({
      ...leaderboard,
      entries: [
        ...leaderboard.entries,
        { ...leaderboard.entries[0], rank: 2, evaluationId: 'e2', checkpoint: undefined, run: { name: 'window16' }, verified: false },
      ],
    });
    renderPage();

    const second = await screen.findByRole('link', { name: /window16/ });
    expect(within(second).getByText('2')).toBeInTheDocument();
    expect(within(second).queryByText(/verified/)).not.toBeInTheDocument();
  });

  it('puts the best recorded results beside them, each opening its evaluation', async () => {
    renderPage();

    const row = await screen.findByRole('link', { name: /segformer-b2/ });
    expect(row).toHaveAttribute('href', '/evaluations/e1');
    expect(within(row).getByText(/mean_iou 0.8123 · verified · Window ablations/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See all leaderboards' })).toHaveAttribute('href', '/leaderboards');
  });

  it('lists findings of public projects only', async () => {
    renderPage();

    expect(await screen.findByText('window16 wins by a hair')).toBeInTheDocument();
    expect(screen.queryByText('A private conclusion')).not.toBeInTheDocument();
  });

  it('narrows to one kind from the chips, and keeps it in the address', async () => {
    renderPage();
    await screen.findByText('Harbour frames');

    fireEvent.click(screen.getByRole('button', { name: 'Datasets' }));

    expect(screen.getByTestId('where')).toHaveTextContent('/?type=datasets');
    expect(screen.queryByText('Window ablations', { selector: 'h3' })).not.toBeInTheDocument();
    expect(screen.getByText('Harbour frames')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Datasets' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens already narrowed from the address', async () => {
    renderPage('/?type=projects');

    expect(await screen.findByText('Night driving')).toBeInTheDocument();
    expect(screen.queryByText('Harbour frames')).not.toBeInTheDocument();
  });

  it('says so when there is nothing public yet', async () => {
    explore.projects.mockResolvedValue([]);
    explore.datasets.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText('No public projects yet.')).toBeInTheDocument();
    expect(screen.getByText('No public datasets yet.')).toBeInTheDocument();
  });

  it('says what failed without taking the rest of the page down', async () => {
    explore.projects.mockRejectedValue(new Error('down'));
    renderPage();

    expect(await screen.findByText('Could not load projects.')).toBeInTheDocument();
    expect(await screen.findByText('Harbour frames')).toBeInTheDocument();
  });

  it('shows only what the configured services can feed', async () => {
    delete config.VISION_API_URL;
    renderPage();

    await screen.findByText('Harbour frames');
    expect(explore.projects).not.toHaveBeenCalled();
    expect(explore.leaderboard).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Leaderboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('says so when no service is configured at all', () => {
    delete config.VISION_API_URL;
    delete config.DATASET_API_URL;
    renderPage();

    expect(screen.getByText('Nothing to browse here yet.')).toBeInTheDocument();
  });

  it('leaves out a part whose service is not configured', async () => {
    delete config.DATASET_API_URL;
    renderPage();

    await screen.findByText('Night driving');
    expect(explore.datasets).not.toHaveBeenCalled();
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

      await waitFor(() => expect(explore.projects).toHaveBeenCalled());
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
