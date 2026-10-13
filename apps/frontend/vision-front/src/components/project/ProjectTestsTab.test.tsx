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
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTab = (props = {}) => render(<ProjectTestsTab {...baseProps} {...props} />, { wrapper: makeWrapper() });

describe('ProjectTestsTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });

    expect(screen.getByRole('status', { name: 'Loading test results' })).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();

    expect(screen.getByText(/^No test results yet\./)).toBeInTheDocument();
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

  it('opens the run\'s test results from its row, but not from the checkbox', () => {
    renderTab({
      testResultsResponse: {
        success: true, data: { testResults: [testResult('tr1', 't1')], pagination: { page: 0, limit: 25, total: 1, pages: 1 } },
      },
    });

    expect(screen.getByRole('link', { name: 'Training t1' })).toHaveAttribute('href', '/trainings/t1?tab=test-results');

    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('3'));
    expect(navigateMock).toHaveBeenCalledWith('/trainings/t1?tab=test-results');
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

  describe('ranking runs', () => {
    const scored = (id: string, trainingId: string, epoch: number, miou: number, loss = 1) => ({
      ...testResult(id, trainingId),
      epoch,
      test_results: { day: { overall: { mean_iou: miou, loss } } },
    });
    const response = (...testResults: unknown[]) => ({
      success: true,
      data: { testResults, pagination: { page: 1, limit: 500, total: testResults.length, pages: 1 } },
    });
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '');

    it('lists one row per run at its best test, best run first', () => {
      renderTab({
        testResultsResponse: response(
          scored('a1', 'A', 5, 0.5),
          scored('a2', 'A', 10, 0.8),
          scored('b1', 'B', 7, 0.9)
        ),
      });

      const rows = names();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toContain('Training B');
      expect(rows[1]).toContain('Training A');
      expect(rows[1]).toContain('0.8000');
      expect(rows[1]).toContain('10');
    });

    it('lists every test under "All tests"', () => {
      renderTab({
        testResultsResponse: response(scored('a1', 'A', 5, 0.5), scored('a2', 'A', 10, 0.8), scored('b1', 'B', 7, 0.9)),
      });

      fireEvent.click(screen.getByRole('button', { name: 'All tests' }));

      expect(names()).toHaveLength(3);
    });

    it.each(['scalar', 'mean'])('ranks by per-class AP reported as a %s', (shape) => {
      const ap = (id: string, trainingId: string, value: number) => ({
        ...testResult(id, trainingId),
        test_results: { day: { car: { ap: shape === 'mean' ? { mean: value } : value } } },
      });
      renderTab({ testResultsResponse: response(ap('a1', 'A', 0.2), ap('b1', 'B', 0.9)) });

      expect(screen.getByRole('combobox', { name: 'Rank by' })).toBeInTheDocument();
      expect(names()[0]).toContain('Training B');
      expect(names()[0]).toContain('0.9000');
      expect(screen.getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument();
    });

    it('re-ranks by the result you choose, reading a loss as lower is better', () => {
      renderTab({
        testResultsResponse: response(scored('a1', 'A', 5, 0.9, 0.9), scored('b1', 'B', 7, 0.1, 0.2)),
      });
      expect(names()[0]).toContain('Training A');

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Rank by' }));
      fireEvent.click(screen.getByRole('option', { name: 'Loss' }));

      expect(names()[0]).toContain('Training B');
    });

    it('says when it holds only the newest of more tests', () => {
      renderTab({
        testResultsResponse: {
          success: true,
          data: { testResults: [scored('a1', 'A', 5, 0.5)], pagination: { page: 1, limit: 500, total: 900, pages: 2 } },
        },
      });

      expect(screen.getByText('Showing the newest 1 of 900 test results.')).toBeInTheDocument();
    });
  });

  it('keeps one row per run, newest test, and claims no ranking when nothing can be ranked', () => {
    renderTab({
      testResultsResponse: {
        success: true,
        data: {
          testResults: [
            { ...testResult('a1', 'A'), epoch: 5, timestamp: '2026-01-01T00:00:00.000Z' },
            { ...testResult('a2', 'A'), epoch: 9, timestamp: '2026-01-02T00:00:00.000Z' },
            testResult('b1', 'B'),
          ],
          pagination: { page: 1, limit: 500, total: 3, pages: 1 },
        },
      },
    });

    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Training A');
    expect(rows[0]).toHaveTextContent('9');
    expect(screen.queryByRole('columnheader', { name: 'Rank' })).not.toBeInTheDocument();
  });
});
