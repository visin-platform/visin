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

vi.mock('../services/testResultService', () => ({
  testResultService: {
    getTestResults: vi.fn(),
    deleteTestResult: vi.fn()
  }
}));

const useAuthMock = vi.fn();
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock()
}));

import TestResultsPage from './TestResultsPage';
import { testResultService } from '../services/testResultService';

const testResultServiceMock = testResultService as unknown as {
  getTestResults: ReturnType<typeof vi.fn>;
  deleteTestResult: ReturnType<typeof vi.fn>;
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TestResultsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const overall = { mIoU_foreground: 0.5, mean_accuracy: 0.6, fw_iou: 0.7, pixel_accuracy: 0.8 };
const condition = {
  vehicle: { iou: 0.4, precision: 0.5, recall: 0.6, f1_score: 0.7, ap: 0.8 },
  sign: { iou: 0.3, precision: 0.4, recall: 0.5, f1_score: 0.6, ap: 0.7 },
  human: { iou: 0.2, precision: 0.3, recall: 0.4, f1_score: 0.5, ap: 0.6 },
  overall
};

const testResult1 = {
  _id: 'tr1',
  timestamp: '2024-01-01T00:00:00.000Z',
  epoch: 5,
  epoch_uuid: 'euuid-1',
  test_uuid: 'tuuid-1',
  test_results: {
    day_fair: condition,
    night_fair: condition,
    day_rain: condition,
    night_rain: condition,
    snow: condition,
    overall
  },
  training: { _id: 't1', name: 'Training One', uuid: 'uuid-1', status: 'done' }
};

describe('TestResultsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: 'u1', groups: ['owner'] }, isAuthenticated: true });
  });

  it('shows a loading spinner while test results are loading', () => {
    testResultServiceMock.getTestResults.mockReturnValue(new Promise(() => {}));

    const { container } = renderPage();

    expect(container.querySelector('.MuiCircularProgress-root')).toBeTruthy();
  });

  it('shows an empty message when there are no test results', async () => {
    testResultServiceMock.getTestResults.mockResolvedValue({ data: { testResults: [] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('No test results found')).toBeInTheDocument();
    });
  });

  it('renders test results in a table with computed metrics and a delete action for owners', async () => {
    testResultServiceMock.getTestResults.mockResolvedValue({ data: { testResults: [testResult1] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Training One')).toBeInTheDocument();
    });
    expect(screen.getByText('Epoch 5')).toBeInTheDocument();
    expect(screen.getByTestId('DeleteIcon')).toBeInTheDocument();
  });

  it('hides the delete action for users without owner/admin role', async () => {
    useAuthMock.mockReturnValue({ user: { id: 'u2', groups: ['member'] }, isAuthenticated: true });
    testResultServiceMock.getTestResults.mockResolvedValue({ data: { testResults: [testResult1] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Training One')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('DeleteIcon')).not.toBeInTheDocument();
  });

  it('selects rows via checkboxes and enables the compare button once 2+ are selected', async () => {
    const testResult2 = { ...testResult1, _id: 'tr2', training: { ...testResult1.training, _id: 't2', name: 'Training Two' } };
    testResultServiceMock.getTestResults.mockResolvedValue({ data: { testResults: [testResult1, testResult2] } });

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    const compareButton = screen.getByRole('button', { name: /Compare Selected/ });
    expect(compareButton).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    // checkboxes[0] is "select all"
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);

    expect(compareButton).not.toBeDisabled();
    fireEvent.click(compareButton);

    expect(navigateMock).toHaveBeenCalledWith(
      expect.stringContaining('/trainings/compare?ids=')
    );
  });

  it('opens the delete confirmation dialog and calls deleteTestResult on confirm', async () => {
    testResultServiceMock.getTestResults.mockResolvedValue({ data: { testResults: [testResult1] } });
    testResultServiceMock.deleteTestResult.mockResolvedValue({});

    renderPage();
    await waitFor(() => expect(screen.getByText('Training One')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('DeleteIcon').closest('button')!);
    expect(screen.getByText('Delete Test Result')).toBeInTheDocument();
    expect(screen.getByText(/tuuid-1/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(testResultServiceMock.deleteTestResult).toHaveBeenCalledWith('tr1');
    });
    await waitFor(() => {
      expect(screen.getByText('Test result deleted successfully')).toBeInTheDocument();
    });
  });
});
