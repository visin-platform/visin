import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectTestsTab from './ProjectTestsTab';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('../../services/comparisonService', () => ({
  comparisonService: { createComparison: vi.fn() },
}));

import { comparisonService } from '../../services/comparisonService';
const mockedComparison = vi.mocked(comparisonService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const testResult = (id: string, trainingId: string) => ({
  _id: id,
  epoch: 3,
  timestamp: '2026-01-01T00:00:00.000Z',
  training: { _id: trainingId, name: `Training ${trainingId}` },
});

const baseProps = {
  projectId: 'p1',
  testResultsResponse: { success: true, data: { testResults: [], pagination: { page: 0, limit: 25, total: 0, pages: 1 } } },
  isLoading: false,
  page: 0,
  rowsPerPage: 25,
  onPageChange: vi.fn(),
  onRowsPerPageChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTab = (props = {}) => render(<ProjectTestsTab {...baseProps} {...props} />, { wrapper: makeWrapper() });

describe('ProjectTestsTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();

    expect(screen.getByText('No test results found for this project.')).toBeInTheDocument();
  });

  it('lists test results with training name, epoch, and timestamp', () => {
    renderTab({
      testResultsResponse: {
        success: true, data: { testResults: [testResult('tr1', 't1')], pagination: { page: 0, limit: 25, total: 1, pages: 1 } },
      },
    });

    expect(screen.getByText('Training t1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('falls back to "Unknown" when the training is missing', () => {
    const orphan = { _id: 'tr1', epoch: 1, timestamp: '2026-01-01T00:00:00.000Z', training: null };
    renderTab({ testResultsResponse: { success: true, data: { testResults: [orphan], pagination: { page: 0, limit: 25, total: 1, pages: 1 } } } });

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows the Compare button once 2+ rows are selected and creates a comparison', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: { uuid: 'cmp-1' } } as never);
    renderTab({
      testResultsResponse: {
        success: true, data: { testResults: [testResult('tr1', 't1'), testResult('tr2', 't2')], pagination: { page: 0, limit: 25, total: 2, pages: 1 } },
      },
    });

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.click(checkboxes[2]);

    const compareButton = screen.getByRole('button', { name: /compare selected \(2\)/i });
    fireEvent.click(compareButton);

    await waitFor(() => expect(mockedComparison.createComparison).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trainings', itemIds: expect.arrayContaining(['t1', 't2']) })
    ));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/comparisons/cmp-1?tab=tests'));
  });

  it('toggles select-all', () => {
    renderTab({
      testResultsResponse: {
        success: true, data: { testResults: [testResult('tr1', 't1'), testResult('tr2', 't2')], pagination: { page: 0, limit: 25, total: 2, pages: 1 } },
      },
    });

    const [selectAll] = screen.getAllByRole('checkbox');
    fireEvent.click(selectAll);

    expect(screen.getByRole('button', { name: /compare selected \(2\)/i })).toBeInTheDocument();

    fireEvent.click(selectAll);
    expect(screen.queryByRole('button', { name: /compare selected/i })).not.toBeInTheDocument();
  });
});
