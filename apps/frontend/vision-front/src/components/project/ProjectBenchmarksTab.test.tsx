import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProjectBenchmarksTab from './ProjectBenchmarksTab';
import type { Benchmark, BenchmarksPaginatedResponse } from '../../types';

vi.mock('../../services/benchmarkService', () => ({
  benchmarkService: { deleteBenchmark: vi.fn() },
}));

import { benchmarkService } from '../../services/benchmarkService';
const mockedBenchmark = vi.mocked(benchmarkService);

const makeBenchmark = (overrides: Partial<Benchmark> = {}): Benchmark => ({
  _id: 'b1',
  results: [],
  timestamp: '2026-01-01T00:00:00.000Z',
  system_info: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makeResponse = (benchmarks: Benchmark[]): BenchmarksPaginatedResponse => ({
  success: true,
  data: {
    benchmarks,
    pagination: { page: 0, limit: 25, total: benchmarks.length, pages: 1 },
  },
});

const baseProps = {
  benchmarksResponse: makeResponse([]),
  isLoading: false,
  isOwner: true,
};

let client: QueryClient;
const tree = (props = {}) => (
  <QueryClientProvider client={client}>
    <MemoryRouter>
      <ProjectBenchmarksTab {...baseProps} {...props} />
    </MemoryRouter>
  </QueryClientProvider>
);
const renderTab = (props = {}) => render(tree(props));

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

describe('ProjectBenchmarksTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });
    expect(screen.getByRole('status', { name: 'Loading benchmarks' })).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();
    expect(screen.getByText(/^No benchmarks yet\./)).toBeInTheDocument();
  });

  it('renders a linked training name, FPS, and parameters (M-scaled from total_parameters_m)', () => {
    const benchmark = makeBenchmark({
      training_id: { _id: 't1', name: 'Run 1', uuid: 'uuid-1' },
      results: [{ fps: 30.456, total_parameters_m: 25.3 }],
    });
    renderTab({ benchmarksResponse: makeResponse([benchmark]) });

    expect(screen.getByRole('link', { name: 'Run 1' })).toHaveAttribute('href', '/trainings/t1?tab=benchmarks');
    expect(screen.getByText('30.46')).toBeInTheDocument();
    expect(screen.getByText('25.3M')).toBeInTheDocument();
  });

  it('falls back to a raw parameter count converted to millions, and "-" when absent', () => {
    const withRawParams = makeBenchmark({ results: [{ total_parameters: 5_000_000 }] });
    const { rerender } = renderTab({
      benchmarksResponse: makeResponse([withRawParams]),
    });
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('5.0M')).toBeInTheDocument();

    const noParams = makeBenchmark({ _id: 'b2' });
    rerender(tree({ benchmarksResponse: makeResponse([noParams]) }));
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('hides the Actions column when not the owner', () => {
    renderTab({
      benchmarksResponse: makeResponse([makeBenchmark()]),
      isOwner: false,
    });

    expect(screen.queryByText('Actions')).not.toBeInTheDocument();
  });

  it('deletes a benchmark via the confirmation dialog and refreshes the lists, without reloading the page', async () => {
    mockedBenchmark.deleteBenchmark.mockResolvedValue(undefined as never);
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    renderTab({ benchmarksResponse: makeResponse([makeBenchmark()]) });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText('Delete Benchmark')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedBenchmark.deleteBenchmark).toHaveBeenCalledWith('b1'));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-benchmarks'] }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['project-dashboard-stats'] });
    await waitFor(() => expect(screen.queryByText('Delete Benchmark')).not.toBeInTheDocument());
  });

  it('shows an error message when deletion fails', async () => {
    mockedBenchmark.deleteBenchmark.mockRejectedValue(new Error('nope'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderTab({ benchmarksResponse: makeResponse([makeBenchmark()]) });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.getByText('Failed to delete benchmark')).toBeInTheDocument());
    expect(consoleError).toHaveBeenCalled();
  });

  it('cancels the delete dialog without deleting', () => {
    renderTab({ benchmarksResponse: makeResponse([makeBenchmark()]) });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockedBenchmark.deleteBenchmark).not.toHaveBeenCalled();
  });

  describe('grouped by device', () => {
    const onDevice = (id: string, gpu: string | undefined, fps: number | undefined, name: string) =>
      makeBenchmark({
        _id: id,
        system_info: gpu ? { gpu_name: gpu } : {},
        results: fps === undefined ? [] : [{ fps }],
        training_id: { _id: `t-${id}`, name, uuid: `u-${id}` },
      });

    it('puts each benchmark under the hardware it ran on, the fastest first', () => {
      renderTab({
        benchmarksResponse: makeResponse([
          onDevice('1', 'RTX 3060', 40, 'slow-on-3060'),
          onDevice('2', 'A100', 200, 'fast-on-a100'),
          onDevice('3', 'RTX 3060', 90, 'quick-on-3060'),
          onDevice('4', undefined, 10, 'no-device'),
        ]),
      });

      const sections = screen.getAllByRole('region').map((section) => section.getAttribute('aria-label'));
      expect(sections).toEqual(['A100', 'RTX 3060', 'Unknown device']);

      const rtx = screen.getByRole('region', { name: 'RTX 3060' });
      const order = Array.from(rtx.querySelectorAll('tbody tr')).map((row) => row.textContent);
      expect(order[0]).toContain('quick-on-3060');
      expect(order[1]).toContain('slow-on-3060');
    });

    it('says when it holds only the newest of more benchmarks', () => {
      renderTab({
        benchmarksResponse: {
          success: true,
          data: {
            benchmarks: [onDevice('1', 'A100', 200, 'run')],
            pagination: { page: 1, limit: 500, total: 800, pages: 2 },
          },
        } as BenchmarksPaginatedResponse,
      });

      expect(screen.getByText('Showing the newest 1 of 800 benchmarks.')).toBeInTheDocument();
    });
  });
});
