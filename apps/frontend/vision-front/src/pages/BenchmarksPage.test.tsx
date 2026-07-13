import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock('@/services/benchmarkService', () => ({
  benchmarkService: {
    getBenchmarks: vi.fn(),
    deleteBenchmark: vi.fn()
  }
}));

const useAuthMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

import BenchmarksPage from './BenchmarksPage';
import { benchmarkService } from '@/services/benchmarkService';

const benchmarkServiceMock = benchmarkService as unknown as {
  getBenchmarks: ReturnType<typeof vi.fn>;
  deleteBenchmark: ReturnType<typeof vi.fn>;
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BenchmarksPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const benchmark1 = {
  _id: 'b1',
  training_id: { _id: 't1', name: 'Training One', uuid: 'uuid-1' },
  timestamp: '2024-01-01T00:00:00.000Z',
  results: [
    {
      device: 'RTX 3090',
      device_type: 'cuda',
      backbone: 'pytorch',
      fps: 30,
      mean_time_ms: 33.3,
      std_time_ms: 1.2,
      total_parameters: 25000000,
      flops_giga: 12.5,
      gpu_memory_mean_mb: 2048,
      ram_memory_mean_mb: 1024,
      image_size: '640x480'
    }
  ]
};

describe('BenchmarksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'u1', groups: ['owner'] }, isAuthenticated: true });
  });

  it('shows a loading spinner while benchmarks are loading', () => {
    benchmarkServiceMock.getBenchmarks.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();

    expect(container.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('shows an empty message when there are no benchmarks', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No benchmarks found')).toBeInTheDocument();
    });
  });

  it('renders a benchmark row with aggregated metrics', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Training One')).toBeInTheDocument();
    });
    expect(screen.getByText('30.00')).toBeInTheDocument(); // avg fps
    expect(screen.getByText('25.00')).toBeInTheDocument(); // params in M
  });

  it('expands a row to show per-device benchmark result details', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    expect(screen.queryByText('Benchmark Results Details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('KeyboardArrowDownIcon').closest('button')!);

    expect(screen.getByText('Benchmark Results Details')).toBeInTheDocument();
    expect(screen.getByText('RTX 3090')).toBeInTheDocument();
  });

  it('navigates to the training page when a row with a linked training is clicked', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Training One'));

    expect(navigateMock).toHaveBeenCalledWith('/trainings/t1?tab=benchmarks');
  });

  it('opens the delete dialog and calls deleteBenchmark on confirm', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });
    benchmarkServiceMock.deleteBenchmark.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('DeleteIcon').closest('button')!);
    expect(screen.getByText('Delete Benchmark')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(benchmarkServiceMock.deleteBenchmark).toHaveBeenCalledWith('b1');
    });
  });

  it('shows an error alert when deletion fails', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });
    benchmarkServiceMock.deleteBenchmark.mockRejectedValue(new Error('fail'));

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('DeleteIcon').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(screen.getByText('Failed to delete benchmark')).toBeInTheDocument();
    });
  });

  it('hides the delete action for users without owner/admin role', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u2', groups: ['member'] }, isAuthenticated: true });
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  it('refetches benchmarks when the refresh button is clicked', async () => {
    benchmarkServiceMock.getBenchmarks.mockResolvedValue({ data: { benchmarks: [benchmark1] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    const callCountBefore = benchmarkServiceMock.getBenchmarks.mock.calls.length;
    fireEvent.click(screen.getByTestId('RefreshIcon').closest('button')!);

    await waitFor(() => {
      expect(benchmarkServiceMock.getBenchmarks.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });
});
