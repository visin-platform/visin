import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const compareTrainingsMock = vi.fn();
vi.mock('../../services/trainingService', () => ({
  trainingService: {
    compareTrainings: (...args: unknown[]) => compareTrainingsMock(...args)
  }
}));

const useAuthMock = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

vi.mock('@/components/comparison/ComparisonTable', () => ({
  default: (props: any) => <div data-testid="comparison-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/test-results/PerformanceMetricsTable', () => ({
  default: (props: any) => <div data-testid="performance-metrics-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/test-results/IoUMetricsTable', () => ({
  default: (props: any) => <div data-testid="iou-metrics-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/test-results/APMetricsTable', () => ({
  default: (props: any) => <div data-testid="ap-metrics-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/comparison/BenchmarksComparisonTable', () => ({
  default: (props: any) => <div data-testid="benchmarks-table">{props.benchmarks.length}</div>
}));
vi.mock('../../components/comparison/TrainingValidationMetricsTable', () => ({
  default: (props: any) => <div data-testid="validation-metrics-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/comparison/TrainingClassIoUTable', () => ({
  default: (props: any) => <div data-testid="class-iou-table">{props.comparisonData.length}</div>
}));
vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs" />
}));
vi.mock('../../components/common/NumberFormattingControls', () => ({
  default: (props: any) => (
    <div data-testid="number-formatting-controls">
      <button onClick={() => props.onDecimalsChange(4)}>set-decimals</button>
    </div>
  )
}));

import TrainingComparisonPage from '../TrainingComparisonPage';

const renderWithProviders = (path: string) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <TrainingComparisonPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('TrainingComparisonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ isAuthenticated: true });
  });

  it('shows a loading spinner while fetching the comparison', () => {
    compareTrainingsMock.mockReturnValue(new Promise(() => {}));
    renderWithProviders('/trainings/compare?ids=t1,t2');
    expect(screen.getByText(/Loading training comparison/i)).toBeInTheDocument();
  });

  it('shows an error message when the query fails', async () => {
    compareTrainingsMock.mockRejectedValue(new Error('server error'));
    renderWithProviders('/trainings/compare?ids=t1,t2');
    expect(await screen.findByText(/Failed to load training comparison: server error/i)).toBeInTheDocument();
  });

  it('renders the training runs tab by default with the comparison table', async () => {
    compareTrainingsMock.mockResolvedValue({
      data: {
        comparison: [
          {
            training: { name: 'Run A' },
            aggregatedTestResults: null,
            testResultsCount: 0,
            benchmarks: []
          },
          {
            training: { name: 'Run B' },
            aggregatedTestResults: { iou: 0.5 },
            testResultsCount: 3,
            benchmarks: [{ name: 'bench1' }]
          }
        ]
      }
    });
    renderWithProviders('/trainings/compare?ids=t1,t2');

    expect(await screen.findByTestId('comparison-table')).toHaveTextContent('2');
    expect(screen.getByText('Training Runs (2)')).toBeInTheDocument();
    expect(screen.getByText('Test Results (1)')).toBeInTheDocument();
    expect(screen.getByText('Benchmarks (1)')).toBeInTheDocument();
  });

  it('opens directly on the test results tab via the ?tab=tests query param', async () => {
    compareTrainingsMock.mockResolvedValue({
      data: {
        comparison: [
          {
            training: { name: 'Run A' },
            aggregatedTestResults: { iou: 0.5 },
            testResultsCount: 2,
            benchmarks: []
          }
        ]
      }
    });
    renderWithProviders('/trainings/compare?ids=t1&tab=tests');

    expect(await screen.findByTestId('iou-metrics-table')).toBeInTheDocument();
    expect(screen.getByTestId('ap-metrics-table')).toBeInTheDocument();
    expect(screen.getByTestId('performance-metrics-table')).toBeInTheDocument();
  });

  it('shows a message when there are no test results to compare on the tests tab', async () => {
    compareTrainingsMock.mockResolvedValue({
      data: { comparison: [{ training: { name: 'Run A' }, aggregatedTestResults: null, testResultsCount: 0, benchmarks: [] }] }
    });
    renderWithProviders('/trainings/compare?ids=t1&tab=tests');
    expect(await screen.findByText('No test results available for comparison')).toBeInTheDocument();
  });

  it('opens directly on the benchmarks tab via the ?tab=benchmarks query param', async () => {
    compareTrainingsMock.mockResolvedValue({
      data: {
        comparison: [
          { training: { name: 'Run A' }, aggregatedTestResults: null, testResultsCount: 0, benchmarks: [{ name: 'bench1' }] }
        ]
      }
    });
    renderWithProviders('/trainings/compare?ids=t1&tab=benchmarks');
    expect(await screen.findByTestId('benchmarks-table')).toHaveTextContent('1');
  });

  it('switches tabs on click and updates the rendered content', async () => {
    const user = userEvent.setup();
    compareTrainingsMock.mockResolvedValue({
      data: {
        comparison: [
          { training: { name: 'Run A' }, aggregatedTestResults: { iou: 1 }, testResultsCount: 1, benchmarks: [] }
        ]
      }
    });
    renderWithProviders('/trainings/compare?ids=t1');

    await screen.findByTestId('comparison-table');
    await user.click(screen.getByText('Test Results (1)'));
    expect(await screen.findByTestId('iou-metrics-table')).toBeInTheDocument();
  });
});
