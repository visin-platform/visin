import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import ProjectEvaluationsTab from './ProjectEvaluationsTab';

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

const evaluation = (id: string, trainingId: string) => ({
  _id: id,
  epoch: 3,
  timestamp: '2026-01-01T00:00:00.000Z',
  training: { _id: trainingId, name: `Training ${trainingId}` },
});

const baseProps = {
  projectId: 'p1',
  evaluationsResponse: { success: true, data: { evaluations: [], pagination: { page: 0, limit: 25, total: 0, pages: 1 } } },
  isLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

const renderTab = (props = {}) => render(<ProjectEvaluationsTab {...baseProps} {...props} />, { wrapper: makeWrapper() });

describe('ProjectEvaluationsTab', () => {
  it('shows a spinner while loading', () => {
    renderTab({ isLoading: true });

    expect(screen.getByRole('status', { name: 'Loading evaluations' })).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    renderTab();

    expect(screen.getByText(/^No evaluations yet\./)).toBeInTheDocument();
  });

  it('lists evaluations with training name, epoch, and timestamp', () => {
    renderTab({
      evaluationsResponse: {
        success: true, data: { evaluations: [evaluation('tr1', 't1')], pagination: { page: 0, limit: 25, total: 1, pages: 1 } },
      },
    });

    expect(screen.getByText('Training t1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('opens the evaluation on its run, in context, from its row, but not from the checkbox', () => {
    renderTab({
      evaluationsResponse: {
        success: true, data: { evaluations: [evaluation('tr1', 't1')], pagination: { page: 0, limit: 25, total: 1, pages: 1 } },
      },
    });

    expect(screen.getByRole('link', { name: 'Training t1' })).toHaveAttribute('href', '/trainings/t1?tab=evaluations&evaluation=tr1');

    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(navigateMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('3'));
    expect(navigateMock).toHaveBeenCalledWith('/trainings/t1?tab=evaluations&evaluation=tr1');
  });

  it('falls back to "Unknown" when the training is missing', () => {
    const orphan = { _id: 'tr1', epoch: 1, timestamp: '2026-01-01T00:00:00.000Z', training: null };
    renderTab({ evaluationsResponse: { success: true, data: { evaluations: [orphan], pagination: { page: 0, limit: 25, total: 1, pages: 1 } } } });

    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  describe('suites and verdicts', () => {
    const onSuite = (id: string, trainingId: string, state: 'eligible' | 'incomplete') => ({
      ...evaluation(id, trainingId),
      suite: { id: 's1', slug: 'night-drive', version: 2 },
      validation: { version: 1, state, reasons: [], warnings: [] }
    });
    const response = (...evaluations: unknown[]) => ({
      success: true,
      data: { evaluations, pagination: { page: 1, limit: 500, total: evaluations.length, pages: 1 } }
    });

    it('has no suite columns or filter while nothing was scored on a suite', () => {
      renderTab({ evaluationsResponse: response(evaluation('tr1', 't1')) });

      expect(screen.queryByRole('columnheader', { name: 'Scored on' })).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Verdict' })).not.toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: 'Show' })).not.toBeInTheDocument();
    });

    it('shows the suite and the verdict beside a result, and says none was named for a plain test', () => {
      renderTab({
        evaluationsResponse: response(onSuite('e1', 't1', 'eligible'), evaluation('tr2', 't2'))
      });

      expect(screen.getByText('night-drive v2')).toBeInTheDocument();
      expect(screen.getByText('Ranked')).toBeInTheDocument();
      expect(screen.getByText('No suite')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Details of the evaluation of Training t1' })).toHaveAttribute('href', '/evaluations/e1');
    });

    it('narrows to the ranked ones, the exploratory ones, or those needing attention', async () => {
      renderTab({
        evaluationsResponse: response(
          onSuite('e1', 't1', 'eligible'),
          onSuite('e2', 't2', 'incomplete'),
          evaluation('tr3', 't3')
        )
      });
      const pick = async (name: string) => {
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Show' }));
        fireEvent.click(await screen.findByRole('option', { name }));
      };

      await pick('Ranked on a suite');
      expect(screen.getByText('Training t1')).toBeInTheDocument();
      expect(screen.queryByText('Training t2')).not.toBeInTheDocument();
      expect(screen.queryByText('Training t3')).not.toBeInTheDocument();

      await pick('Needs attention');
      expect(screen.getByText('Training t2')).toBeInTheDocument();
      expect(screen.queryByText('Training t1')).not.toBeInTheDocument();

      await pick('Exploratory (no suite)');
      expect(screen.getByText('Training t3')).toBeInTheDocument();
      expect(screen.queryByText('Training t2')).not.toBeInTheDocument();
    });

    it('opens one with no run on its own page, since it has no run to be read on', () => {
      renderTab({
        evaluationsResponse: response({
          ...onSuite('e9', 't9', 'eligible'),
          training: undefined,
          checkpoint: { kind: 'hf', repo: 'org/model', commit: 'abcdef1234', path: 'model.pt' }
        })
      });

      const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
      expect(links).toContain('/evaluations/e9');
      expect(links.every((href) => href === '/evaluations/e9')).toBe(true);
    });

    it('drops a filter when no result is on a suite any more, rather than hiding everything', async () => {
      const { rerender } = render(
        <ProjectEvaluationsTab {...baseProps} evaluationsResponse={response(onSuite('e1', 't1', 'eligible'), evaluation('tr2', 't2')) as never} />,
        { wrapper: makeWrapper() }
      );
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Show' }));
      fireEvent.click(await screen.findByRole('option', { name: 'Ranked on a suite' }));
      expect(screen.queryByText('Training t2')).not.toBeInTheDocument();

      // The suite result is gone (trashed, say): the filter's control goes with it, and so does the filter.
      rerender(<ProjectEvaluationsTab {...baseProps} evaluationsResponse={response(evaluation('tr2', 't2')) as never} />);
      expect(screen.queryByRole('combobox', { name: 'Show' })).not.toBeInTheDocument();
      expect(screen.getByText('Training t2')).toBeInTheDocument();
    });

    it('names a result with no run by the checkpoint that was scored', () => {
      renderTab({
        evaluationsResponse: response({
          ...onSuite('e1', 't1', 'eligible'),
          training: undefined,
          checkpoint: { kind: 'hf', repo: 'org/model', commit: 'abcdef1234', path: 'model.pt' }
        })
      });

      expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
      expect(screen.getByText(/org\/model/)).toBeInTheDocument();
    });
  });

  it('shows the Compare button once 2+ rows are selected and creates a comparison', async () => {
    mockedComparison.createComparison.mockResolvedValue({ success: true, data: { uuid: 'cmp-1' } } as never);
    renderTab({
      evaluationsResponse: {
        success: true, data: { evaluations: [evaluation('tr1', 't1'), evaluation('tr2', 't2')], pagination: { page: 0, limit: 25, total: 2, pages: 1 } },
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
      evaluationsResponse: {
        success: true, data: { evaluations: [evaluation('tr1', 't1'), evaluation('tr2', 't2')], pagination: { page: 0, limit: 25, total: 2, pages: 1 } },
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
      ...evaluation(id, trainingId),
      epoch,
      test_results: { day: { overall: { mean_iou: miou, loss } } },
    });
    const response = (...evaluations: unknown[]) => ({
      success: true,
      data: { evaluations, pagination: { page: 1, limit: 500, total: evaluations.length, pages: 1 } },
    });
    const names = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent ?? '');

    it('lists one row per run at its best test, best run first', () => {
      renderTab({
        evaluationsResponse: response(
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

    it('lists every test under "All evaluations"', () => {
      renderTab({
        evaluationsResponse: response(scored('a1', 'A', 5, 0.5), scored('a2', 'A', 10, 0.8), scored('b1', 'B', 7, 0.9)),
      });

      fireEvent.click(screen.getByRole('button', { name: 'All evaluations' }));

      expect(names()).toHaveLength(3);
    });

    it.each(['scalar', 'mean'])('ranks by per-class AP reported as a %s', (shape) => {
      const ap = (id: string, trainingId: string, value: number) => ({
        ...evaluation(id, trainingId),
        test_results: { day: { car: { ap: shape === 'mean' ? { mean: value } : value } } },
      });
      renderTab({ evaluationsResponse: response(ap('a1', 'A', 0.2), ap('b1', 'B', 0.9)) });

      expect(screen.getByRole('combobox', { name: 'Rank by' })).toBeInTheDocument();
      expect(names()[0]).toContain('Training B');
      expect(names()[0]).toContain('0.9000');
      expect(screen.getByRole('columnheader', { name: 'Rank' })).toBeInTheDocument();
    });

    it('re-ranks by the result you choose, reading a loss as lower is better', () => {
      renderTab({
        evaluationsResponse: response(scored('a1', 'A', 5, 0.9, 0.9), scored('b1', 'B', 7, 0.1, 0.2)),
      });
      expect(names()[0]).toContain('Training A');

      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Rank by' }));
      fireEvent.click(screen.getByRole('option', { name: 'Loss' }));

      expect(names()[0]).toContain('Training B');
    });

    it('says when it holds only the newest of more tests', () => {
      renderTab({
        evaluationsResponse: {
          success: true,
          data: { evaluations: [scored('a1', 'A', 5, 0.5)], pagination: { page: 1, limit: 500, total: 900, pages: 2 } },
        },
      });

      expect(screen.getByText('Showing the newest 1 of 900 evaluations.')).toBeInTheDocument();
    });
  });

  it('keeps one row per run, newest test, and claims no ranking when nothing can be ranked', () => {
    renderTab({
      evaluationsResponse: {
        success: true,
        data: {
          evaluations: [
            { ...evaluation('a1', 'A'), epoch: 5, timestamp: '2026-01-01T00:00:00.000Z' },
            { ...evaluation('a2', 'A'), epoch: 9, timestamp: '2026-01-02T00:00:00.000Z' },
            evaluation('b1', 'B'),
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
