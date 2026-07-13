import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TrainingBenchmarksTab from './TrainingBenchmarksTab';
import { benchmarkService } from '../services/benchmarkService';
import { Benchmark } from '../types';

vi.mock('../services/benchmarkService', () => ({
  benchmarkService: {
    getBenchmarks: vi.fn(),
    deleteBenchmark: vi.fn()
  }
}));

const mockedBenchmarkService = vi.mocked(benchmarkService);

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

const renderComponent = (props: { training_uuid: string; isAuthenticated: boolean }) => {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TrainingBenchmarksTab {...props} />
    </QueryClientProvider>
  );
};

const benchmark: Benchmark = {
  _id: 'b1',
  training_uuid: 'training-uuid-1',
  timestamp: '2026-01-01T10:00:00.000Z',
  system_info: {
    cpu_count: 8,
    cpu_count_logical: 16,
    memory_total_gb: 32,
    gpu_name: 'RTX 4090',
    gpu_memory_total_gb: 24,
    gpu_driver: '535.1'
  } as any,
  results: [
    { device_type: 'cpu', trainable_parameters_m: 10, fps: 20 },
    { device_type: 'cuda', trainable_parameters_m: 10, fps: 200 }
  ],
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z'
};

describe('TrainingBenchmarksTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
  });

  it('renders empty state when there are no benchmarks', async () => {
    mockedBenchmarkService.getBenchmarks.mockResolvedValue({
      data: { benchmarks: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }
    } as any);

    renderComponent({ training_uuid: 'training-uuid-1', isAuthenticated: false });

    await waitFor(() => {
      expect(screen.getByText('No benchmarks found for this training')).toBeInTheDocument();
    });
  });

  it('renders benchmark details with CPU/GPU comparison', async () => {
    mockedBenchmarkService.getBenchmarks.mockResolvedValue({
      data: { benchmarks: [benchmark], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }
    } as any);

    renderComponent({ training_uuid: 'training-uuid-1', isAuthenticated: false });

    await waitFor(() => {
      expect(screen.getByText(/Benchmark -/)).toBeInTheDocument();
    });
    expect(screen.getByText('CPU Cores: 8')).toBeInTheDocument();
    expect(screen.getByText('GPU: RTX 4090')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete benchmark/i })).not.toBeInTheDocument();
  });

  it('shows delete action when authenticated and deletes on confirm', async () => {
    mockedBenchmarkService.getBenchmarks.mockResolvedValue({
      data: { benchmarks: [benchmark], pagination: { page: 1, limit: 10, total: 1, pages: 1 } }
    } as any);
    mockedBenchmarkService.deleteBenchmark.mockResolvedValue({ data: undefined } as any);

    renderComponent({ training_uuid: 'training-uuid-1', isAuthenticated: true });

    await waitFor(() => {
      expect(screen.getByText(/Benchmark -/)).toBeInTheDocument();
    });

    const deleteButton = screen.getByRole('button');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockedBenchmarkService.deleteBenchmark).toHaveBeenCalledWith('b1');
    });
  });

  it('shows an error message when loading benchmarks fails', async () => {
    mockedBenchmarkService.getBenchmarks.mockRejectedValue(new Error('boom'));

    renderComponent({ training_uuid: 'training-uuid-1', isAuthenticated: false });

    await waitFor(() => {
      expect(screen.getByText('Failed to load benchmarks')).toBeInTheDocument();
    });
  });
});
