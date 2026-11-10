import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RunStanding from './RunStanding';
import { getBestRun } from '../../services/bestRunService';
import type { BestRun, RankedRun } from '../../types/bestRun';

vi.mock('../../services/bestRunService', () => ({ getBestRun: vi.fn() }));

const row = (id: string, name: string, value: number, epoch: number): RankedRun => ({
  training: { _id: id, name, status: 'completed', createdAt: '2026-10-01T00:00:00Z' },
  value,
  epoch
});
const answer = (ranking: RankedRun[], direction: 'higher' | 'lower' = 'higher'): BestRun => ({
  runs: ranking.length,
  ranking,
  best: {
    training: { _id: ranking[0].training._id, uuid: 'u', name: ranking[0].training.name, status: 'completed' },
    project: { _id: 'p', name: 'Road' },
    metric: { path: 'val.mean_iou', direction, directionFrom: 'default', source: 'guessed' },
    value: ranking[0].value,
    epoch: ranking[0].epoch
  }
});
const mount = (trainingId: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <RunStanding trainingId={trainingId} projectId="p" />
      </MemoryRouter>
    </QueryClientProvider>
  );

describe('RunStanding', () => {
  it('says where a run stands and how far it is from the best, with a way to compare', async () => {
    vi.mocked(getBestRun).mockResolvedValue(
      answer([row('a', 'clft', 0.8, 12), row('b', 'tweak', 0.7, 30), row('c', 'base', 0.5, 5)])
    );
    mount('b');
    expect(await screen.findByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('2nd').parentElement).toHaveTextContent(/2nd of 3 on .*: 0\.7000 at epoch 30, 0\.1000 below clft \(0\.8000\)\./);
    expect(screen.getByRole('link', { name: 'clft' })).toHaveAttribute('href', '/trainings/a');
    expect(screen.getByRole('link', { name: 'Compare with the best' })).toHaveAttribute(
      'href',
      '/trainings/compare?ids=b,a,c'
    );
  });

  it('calls the best run the best, and offers the next best to compare with', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([row('a', 'clft', 0.8, 12), row('b', 'tweak', 0.7, 30)]));
    mount('a');
    expect(await screen.findByText('Best')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Compare with the next best' })).toBeInTheDocument();
  });

  it('reads "above" for a result where lower is better', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([row('a', 'clft', 0.2, 12), row('b', 'tweak', 0.5, 30)], 'lower'));
    mount('b');
    expect(await screen.findByText(/0\.3000 above/)).toBeInTheDocument();
  });

  it('says nothing for a run that did not report the result, or when it is the only one', async () => {
    vi.mocked(getBestRun).mockResolvedValue(answer([row('a', 'clft', 0.8, 12), row('b', 'tweak', 0.7, 30)]));
    const { container } = mount('silent');
    await vi.waitFor(() => expect(getBestRun).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
