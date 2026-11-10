import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RunsOverview from './RunsOverview';
import { getBestRun } from '../../services/bestRunService';
import type { BestRun } from '../../types/bestRun';

vi.mock('../../services/bestRunService', () => ({ getBestRun: vi.fn() }));
const chart = vi.hoisted(() => vi.fn((_props: unknown) => <div data-testid="progress-chart" />));
vi.mock('@mui/x-charts/LineChart', () => ({ LineChart: chart }));

const run = (id: string, name: string, day: number, value: number, status = 'completed') => ({
  training: { _id: id, name, status: status as 'completed', createdAt: new Date(Date.UTC(2026, 9, day)).toISOString() },
  value,
  epoch: day * 10
});
const answer = (ranking: BestRun['ranking'], runs = ranking?.length ?? 0): BestRun => ({
  runs,
  ranking,
  best: {
    training: {
      _id: ranking?.[0]?.training._id ?? '',
      uuid: 'u',
      name: ranking?.[0]?.training.name ?? '',
      status: 'completed'
    },
    project: { _id: 'p', name: 'Road' },
    metric: { path: 'val.mean_iou', direction: 'higher', directionFrom: 'default', source: 'guessed' },
    value: ranking?.[0]?.value ?? 0,
    epoch: ranking?.[0]?.epoch ?? 0
  }
});

const mount = (onSeeAll = vi.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <RunsOverview projectId="p" onSeeAll={onSeeAll} />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('RunsOverview', () => {
  it('ranks the runs on the project’s result, best first, and links each to its run', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([run('c', 'clft', 3, 0.8), run('a', 'baseline', 1, 0.5)]));
    mount();
    const table = await screen.findByRole('table', { name: /Runs ranked by/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('link', { name: 'clft' })).toHaveAttribute('href', '/trainings/c');
    expect(within(rows[0]).getByText('0.8000')).toBeInTheDocument();
    expect(within(rows[1]).getByText('baseline')).toBeInTheDocument();
    expect(screen.getByText('higher is better')).toBeInTheDocument();
  });

  it('draws the project’s progress over time once there is more than one run, and says how far it has come', async () => {
    vi.mocked(getBestRun).mockResolvedValue(
      answer([run('c', 'clft', 3, 0.8), run('b', 'tweak', 2, 0.6), run('a', 'baseline', 1, 0.5)])
    );
    mount();
    expect(await screen.findByTestId('progress-chart')).toBeInTheDocument();
    expect(screen.getByText(/0\.5000 → 0\.8000 over 3 runs, 2 improvements/)).toBeInTheDocument();
  });

  it('has no progress chart for a single run', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([run('a', 'only', 1, 0.5)]));
    mount();
    await screen.findByRole('table');
    expect(screen.queryByTestId('progress-chart')).not.toBeInTheDocument();
    expect(screen.getByText('1 run')).toBeInTheDocument();
  });

  it('says how many runs never reported the result, and opens the trainings tab', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([run('a', 'one', 1, 0.5), run('b', 'two', 2, 0.4)], 5));
    const onSeeAll = vi.fn();
    mount(onSeeAll);
    expect(await screen.findByText('2 of 5 runs reported this result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open trainings' }));
    expect(onSeeAll).toHaveBeenCalled();
  });

  it('shows only the top runs and offers the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) => run(`r${i}`, `run ${i}`, i + 1, 0.9 - i / 100));
    vi.mocked(getBestRun).mockResolvedValue(answer(many));
    mount();
    await screen.findByRole('table');
    expect(screen.getAllByRole('link')).toHaveLength(8);
    expect(screen.getByRole('button', { name: 'All 12 trainings' })).toBeInTheDocument();
  });

  it('shows a run that is still training with its state', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([run('a', 'live', 1, 0.5, 'running')]));
    mount();
    expect(await screen.findByText(/running/i)).toBeInTheDocument();
  });

  it('shows nothing when no run has reported a result, or the lookup fails', async () => {
    vi.mocked(getBestRun).mockResolvedValue({ runs: 2, best: null });
    const { container } = mount();
    await vi.waitFor(() => expect(getBestRun).toHaveBeenCalled());
    await vi.waitFor(() => expect(container.querySelector('table')).toBeNull());
    expect(screen.queryByText(/Runs ranked/)).not.toBeInTheDocument();
  });
});
