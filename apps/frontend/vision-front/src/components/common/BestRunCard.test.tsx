import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import BestRunCard from './BestRunCard';
import { getBestRun } from '../../services/bestRunService';
import type { BestRun } from '../../types/bestRun';

vi.mock('../../services/bestRunService', () => ({ getBestRun: vi.fn() }));

const best = (overrides: Partial<NonNullable<BestRun['best']>> = {}): BestRun => ({
  runs: 3,
  best: {
    training: { _id: 't1', uuid: 'u1', name: 'clft v2', status: 'completed', projectId: 'p1' },
    project: { _id: 'p1', name: 'Road' },
    metric: { path: 'val.mean_iou', direction: 'higher', directionFrom: 'default', source: 'guessed' },
    value: 0.81234,
    epoch: 12,
    ...overrides
  }
});

const renderCard = (props: React.ComponentProps<typeof BestRunCard>) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <BestRunCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('BestRunCard', () => {
  beforeEach(() => vi.mocked(getBestRun).mockReset());

  it('names the run, the measure, the epoch and how the measure was chosen', async () => {
    vi.mocked(getBestRun).mockResolvedValue(best());
    renderCard({ projectId: 'p1' });

    expect(await screen.findByRole('link', { name: 'clft v2' })).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByText('0.8123')).toBeInTheDocument();
    expect(screen.getByText(/at epoch 12 \(higher is better\)/)).toBeInTheDocument();
    expect(screen.getByText(/picked from what the runs report because the project has not chosen a result/)).toBeInTheDocument();
    expect(screen.getByText(/assumed from the name/)).toBeInTheDocument();
    expect(getBestRun).toHaveBeenCalledWith({ projectId: 'p1', datasetId: undefined });
  });

  it('says so plainly when the project chose the result and the direction', async () => {
    vi.mocked(getBestRun).mockResolvedValue(best({ metric: { path: 'val.loss', direction: 'lower', directionFrom: 'taxonomy', source: 'project' } }));
    renderCard({ projectId: 'p1' });

    expect(await screen.findByText(/Ranked on val.loss, the result this project chose/)).toBeInTheDocument();
    expect(screen.getByText(/\(lower is better\)/)).toBeInTheDocument();
    expect(screen.queryByText(/assumed from the name/)).not.toBeInTheDocument();
  });

  it('names the project on a dataset page, where runs come from several', async () => {
    vi.mocked(getBestRun).mockResolvedValue(best());
    renderCard({ datasetId: 'd1', showProject: true });

    expect(await screen.findByText('in Road')).toBeInTheDocument();
  });

  it('explains why there is no best run instead of showing nothing', async () => {
    vi.mocked(getBestRun).mockResolvedValue({ runs: 2, best: null });
    renderCard({ projectId: 'p1' });

    expect(await screen.findByText('No best run yet')).toBeInTheDocument();
    expect(screen.getByText(/None of the 2 runs have reported a score/)).toBeInTheDocument();
    expect(screen.getByText(/name the result to rank on under Settings/)).toBeInTheDocument();
  });

  it('shows nothing with no runs, and nothing when the lookup fails', async () => {
    vi.mocked(getBestRun).mockResolvedValueOnce({ runs: 0, best: null });
    const { container, unmount } = renderCard({ projectId: 'p1' });
    await vi.waitFor(() => expect(getBestRun).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    vi.mocked(getBestRun).mockRejectedValueOnce(new Error('403'));
    const failed = renderCard({ projectId: 'p2' });
    await vi.waitFor(() => expect(getBestRun).toHaveBeenCalledTimes(2));
    expect(failed.container).toBeEmptyDOMElement();
  });
});
