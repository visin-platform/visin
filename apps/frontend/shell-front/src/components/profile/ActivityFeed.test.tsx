import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/exploreApi')>()),
  exploreApi: { activity: vi.fn() },
}));

import { ActivityFeed } from './ActivityFeed';
import { exploreApi, type ActivityItem } from '../../services/exploreApi';

const activity = vi.mocked(exploreApi.activity);
const now = new Date(2026, 8, 15, 20, 0);
const ago = (hours: number) => new Date(now.getTime() - hours * 3600 * 1000).toISOString();
const project = { id: 'p1', name: 'Window ablations', slug: 'window-ablations' };

const renderFeed = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ActivityFeed owner={{ user: 'u9' }} cacheKey="user:ann" now={now} />
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ActivityFeed', () => {
  it('asks for the person it was given', async () => {
    activity.mockResolvedValue([]);
    renderFeed();

    await screen.findByText('Nothing public yet.');
    expect(activity).toHaveBeenCalledWith({ user: 'u9' });
  });

  it('says what each kind of line did, with the things it names as links', async () => {
    const items: ActivityItem[] = [
      { kind: 'project.created', at: ago(1), project },
      { kind: 'training.run', at: ago(2), project, count: 9 },
      { kind: 'training.run', at: ago(3), project: { id: 'p2', name: 'Night driving' }, count: 1 },
      { kind: 'evaluation.recorded', at: ago(4), project, evaluation: { id: 'e1', status: 'completed', suite: { slug: 'cityscapes', version: 2 } } },
      { kind: 'evaluation.recorded', at: ago(5), project, evaluation: { id: 'e2', status: 'failed' } },
      { kind: 'dataset.created', at: ago(6), dataset: { id: 'd1', name: 'Harbour frames', imageCount: 12 } },
    ];
    activity.mockResolvedValue(items);
    renderFeed();

    const lines = (await screen.findAllByRole('listitem')).map((line) => line.textContent);
    expect(lines).toEqual([
      expect.stringMatching(/^Created the project Window ablations/),
      expect.stringMatching(/^Ran 9 trainings in Window ablations/),
      expect.stringMatching(/^Ran a training in Night driving/),
      expect.stringMatching(/^Recorded an evaluation on cityscapes@2 in Window ablations/),
      expect.stringMatching(/^Recorded a failed evaluation in Window ablations/),
      expect.stringMatching(/^Created the dataset Harbour frames/),
    ]);
    expect(screen.getAllByRole('link', { name: 'Window ablations' })[0]).toHaveAttribute('href', '/projects/window-ablations');
    // No slug: the id opens it.
    expect(screen.getByRole('link', { name: 'Night driving' })).toHaveAttribute('href', '/projects/p2');
    expect(screen.getByRole('link', { name: 'Harbour frames' })).toHaveAttribute('href', '/datasets/d1');
  });

  it('says whether a person or an assistant wrote a finding, in words', async () => {
    activity.mockResolvedValue([
      { kind: 'finding.posted', at: ago(1), project, finding: { id: 'f1', title: 'window16 wins', authorKind: 'assistant', authorLabel: 'Claude' } },
      { kind: 'finding.posted', at: ago(2), project, finding: { id: 'f2', title: 'A person said', authorKind: 'person', authorLabel: 'Ann' } },
    ]);
    renderFeed();

    const [assistant, person] = await screen.findAllByRole('listitem');
    expect(assistant).toHaveTextContent('Posted a finding “window16 wins” in Window ablations · via Claude');
    expect(person).toHaveTextContent('Posted a finding “A person said” in Window ablations');
    expect(person).not.toHaveTextContent('via');
    expect(within(assistant).getByRole('link', { name: '“window16 wins”' })).toHaveAttribute(
      'href',
      '/projects/window-ablations?tab=analysis'
    );
  });

  it('groups lines by day, and says how long ago each was', async () => {
    activity.mockResolvedValue([
      { kind: 'project.created', at: ago(2), project },
      { kind: 'project.created', at: ago(26), project: { id: 'p2', name: 'Yesterday project' } },
      { kind: 'project.created', at: new Date(2026, 7, 1, 12).toISOString(), project: { id: 'p3', name: 'Old project' } },
    ]);
    renderFeed();

    expect(await screen.findByRole('region', { name: 'Today' })).toHaveTextContent('2 hours ago');
    expect(screen.getByRole('region', { name: 'Yesterday' })).toHaveTextContent('Yesterday project');
    // A day older than that is named, in the viewer's language.
    expect(screen.getByRole('region', { name: /August/ })).toHaveTextContent('Old project');
  });

  it('names the year of a line from long ago', async () => {
    activity.mockResolvedValue([{ kind: 'project.created', at: new Date(2024, 2, 5, 12).toISOString(), project }]);
    renderFeed();

    expect(await screen.findByRole('region', { name: /2024/ })).toBeInTheDocument();
  });

  it('puts two lines of one day under one heading', async () => {
    activity.mockResolvedValue([
      { kind: 'project.created', at: ago(1), project },
      { kind: 'training.run', at: ago(2), project, count: 2 },
    ]);
    renderFeed();

    await screen.findAllByRole('listitem');
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('says what failed, and tries again on request', async () => {
    activity.mockRejectedValueOnce(new Error('down'));
    activity.mockResolvedValue([{ kind: 'project.created', at: ago(1), project }]);
    renderFeed();

    expect(await screen.findByText('Could not load activity.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/Created the project/)).toBeInTheDocument();
  });

  it('shows a placeholder while it loads', () => {
    activity.mockReturnValue(new Promise(() => {}));
    renderFeed();

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
