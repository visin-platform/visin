import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
  page: 0,
  rowsPerPage: 25,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
  isOwner: true,
};

const renderTab = (props = {}) =>
  render(
    <MemoryRouter>
      <ProjectBenchmarksTab {...baseProps} {...props} />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
});

describe('ProjectBenchmarksTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();
    expect(screen.getByText('No benchmarks found for this project.')).toBeInTheDocument();
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
    rerender(
      <MemoryRouter>
        <ProjectBenchmarksTab {...baseProps} benchmarksResponse={makeResponse([noParams])} />
      </MemoryRouter>
    );
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

  it('deletes a benchmark via the confirmation dialog and reloads the page', async () => {
    mockedBenchmark.deleteBenchmark.mockResolvedValue(undefined as never);
    renderTab({ benchmarksResponse: makeResponse([makeBenchmark()]) });

    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(screen.getByText('Delete Benchmark')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(mockedBenchmark.deleteBenchmark).toHaveBeenCalledWith('b1'));
    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
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
});
