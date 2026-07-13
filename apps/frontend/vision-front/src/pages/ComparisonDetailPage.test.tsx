import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ uuid: 'comp-uuid-1' }),
    useNavigate: () => navigateMock
  };
});

vi.mock('../services/comparisonService', () => ({
  comparisonService: {
    getComparisonByUuid: vi.fn(),
    updateComparison: vi.fn(),
    deleteComparison: vi.fn()
  }
}));

vi.mock('../services/trainingService', () => ({
  trainingService: {
    getTrainings: vi.fn(),
    compareTrainings: vi.fn()
  }
}));

vi.mock('../services/projectService', () => ({
  projectService: {
    getProjectById: vi.fn()
  }
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn()
}));

vi.mock('../utils/latex/comparisonExportLatex', () => ({
  generateTrainingLatex: vi.fn(() => 'training-latex'),
  generateTestingLatex: vi.fn(() => 'testing-latex'),
  generateBenchmarkingLatex: vi.fn(() => 'benchmarking-latex')
}));

vi.mock('@/components/comparison/ComparisonTable', () => ({
  default: (props: any) => <div data-testid="comparison-table">rows:{props.comparisonData?.length}</div>
}));
vi.mock('../components/test-results/PerformanceMetricsTable', () => ({
  default: (props: any) => <div data-testid="performance-metrics-table">rows:{props.comparisonData?.length}</div>
}));
vi.mock('../components/test-results/IoUMetricsTable', () => ({
  default: (props: any) => <div data-testid="iou-metrics-table">rows:{props.comparisonData?.length}</div>
}));
vi.mock('../components/test-results/APMetricsTable', () => ({
  default: (props: any) => <div data-testid="ap-metrics-table">rows:{props.comparisonData?.length}</div>
}));
vi.mock('../components/comparison/BenchmarksComparisonTable', () => ({
  default: (props: any) => <div data-testid="benchmarks-comparison-table">rows:{props.benchmarks?.length}</div>
}));
vi.mock('../components/common/PageBreadcrumbs', () => ({
  default: (props: any) => <div data-testid="breadcrumbs">{props.items.map((i: any) => i.label).join('>')}</div>
}));
vi.mock('../components/comparisons/DeleteComparisonDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-dialog">
        <button onClick={props.onConfirm}>confirm-delete</button>
        <button onClick={props.onClose}>cancel-delete</button>
      </div>
    ) : null
}));
vi.mock('../components/comparison/EditComparisonDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="edit-dialog">
        <span>editName:{props.editName}</span>
        <button onClick={props.onConfirm}>confirm-edit</button>
        <button onClick={props.onClose}>cancel-edit</button>
      </div>
    ) : null
}));
vi.mock('../components/comparison/ExportLatexDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="export-latex-dialog" /> : null)
}));
vi.mock('../components/common/NumberFormattingControls', () => ({
  default: () => <div data-testid="number-formatting-controls" />
}));
vi.mock('../components/comparison/TrainingClassIoUTable', () => ({
  default: () => <div data-testid="training-class-iou-table" />
}));
vi.mock('../components/comparison/TrainingValidationMetricsTable', () => ({
  default: () => <div data-testid="training-validation-metrics-table" />
}));

import ComparisonDetailPage from './ComparisonDetailPage';
import { comparisonService } from '../services/comparisonService';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';

const comparisonServiceMock = comparisonService as unknown as {
  getComparisonByUuid: ReturnType<typeof vi.fn>;
  updateComparison: ReturnType<typeof vi.fn>;
  deleteComparison: ReturnType<typeof vi.fn>;
};
const trainingServiceMock = trainingService as unknown as {
  getTrainings: ReturnType<typeof vi.fn>;
  compareTrainings: ReturnType<typeof vi.fn>;
};
const projectServiceMock = projectService as unknown as {
  getProjectById: ReturnType<typeof vi.fn>;
};

const baseComparison = {
  _id: 'c1',
  name: 'My Comparison',
  description: 'desc here',
  projectId: 'p1',
  itemIds: ['t1', 't2'],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-02T00:00:00.000Z'
};

const baseProject = { _id: 'p1', name: 'Project One', slug: 'project-one' };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ComparisonDetailPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ComparisonDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trainingServiceMock.getTrainings.mockResolvedValue({ data: { trainings: [] } });
    projectServiceMock.getProjectById.mockResolvedValue({ data: baseProject });
  });

  it('shows a loading spinner while the comparison is loading', async () => {
    comparisonServiceMock.getComparisonByUuid.mockReturnValue(new Promise(() => {}));
    trainingServiceMock.compareTrainings.mockResolvedValue({ data: { comparison: [] } });

    renderPage();

    expect(screen.getByText('Loading comparison...')).toBeInTheDocument();
  });

  it('shows an error message when the comparison fails to load', async () => {
    comparisonServiceMock.getComparisonByUuid.mockRejectedValue(new Error('nope'));

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to load comparison\. It may not exist/)
      ).toBeInTheDocument();
    });
  });

  it('renders the populated comparison with training metrics tab by default', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({
      data: {
        comparison: [
          {
            training: { name: 'Training A' },
            aggregatedTestResults: { some: 'metric' },
            testResultsCount: 3,
            benchmarks: [{ id: 'b1' }]
          }
        ]
      }
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('My Comparison')).toBeInTheDocument();
    });

    expect(screen.getByText('desc here')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Projects>Project One>My Comparison');
    expect(screen.getByTestId('comparison-table')).toHaveTextContent('rows:1');
    expect(screen.getByTestId('training-class-iou-table')).toBeInTheDocument();
  });

  it('switches to the Test Results tab and shows the test result tables', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({
      data: {
        comparison: [
          {
            training: { name: 'Training A' },
            aggregatedTestResults: { some: 'metric' },
            testResultsCount: 3,
            benchmarks: []
          }
        ]
      }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('My Comparison')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Test Results' }));

    expect(screen.getByText('Test Results Comparison')).toBeInTheDocument();
    expect(screen.getByTestId('performance-metrics-table')).toHaveTextContent('rows:1');
  });

  it('switches to the Benchmarks tab and shows an empty message when there are none', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({
      data: {
        comparison: [
          {
            training: { name: 'Training A' },
            aggregatedTestResults: null,
            testResultsCount: 0,
            benchmarks: []
          }
        ]
      }
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('My Comparison')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: 'Benchmarks' }));

    expect(screen.getByText('No benchmark data available for comparison.')).toBeInTheDocument();
  });

  it('shows the empty-state alert when there is no comparison data', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({ data: { comparison: [] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No training data available for comparison.')).toBeInTheDocument();
    });
  });

  it('opens the edit dialog with the comparison values when the edit icon is clicked', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({ data: { comparison: [] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('My Comparison')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Edit Comparison'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-dialog')).toHaveTextContent('editName:My Comparison');
    });
  });

  it('opens the delete dialog and calls deleteComparison + navigates on confirm', async () => {
    comparisonServiceMock.getComparisonByUuid.mockResolvedValue({ data: baseComparison });
    trainingServiceMock.compareTrainings.mockResolvedValue({ data: { comparison: [] } });
    comparisonServiceMock.deleteComparison.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByText('My Comparison')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Delete Comparison'));
    expect(screen.getByTestId('delete-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('confirm-delete'));

    await waitFor(() => {
      expect(comparisonServiceMock.deleteComparison).toHaveBeenCalledWith('c1');
      expect(navigateMock).toHaveBeenCalledWith('/projects/project-one');
    });
  });
});
