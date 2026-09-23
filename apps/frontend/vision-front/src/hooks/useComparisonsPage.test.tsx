vi.mock('./useWriteCapabilities', async () => {
  const { useAuth } = await import('../contexts/AuthContext');
  return { useWriteCapabilities: () => { const { isAuthenticated } = useAuth(); return (id?: string) => !!id && isAuthenticated; } };
});
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

let authState = { user: { groupRoles: ['owner'] } as any, isAuthenticated: true };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => authState
}));

vi.mock('../services/comparisonService', () => ({
  comparisonService: { getComparisons: vi.fn(), deleteComparison: vi.fn(), updateComparison: vi.fn() }
}));
vi.mock('../services/trainingService', () => ({
  trainingService: { getTrainings: vi.fn() }
}));

import { comparisonService } from '../services/comparisonService';
import { trainingService } from '../services/trainingService';
import { useComparisonsPage } from './useComparisonsPage';
import type { Comparison } from '@/types';

const mockedComparison = vi.mocked(comparisonService);
const mockedTraining = vi.mocked(trainingService);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const makeComparison = (overrides: Partial<Comparison> = {}): Comparison =>
  ({
    _id: 'c1',
    name: 'Comparison 1',
    description: '',
    type: 'trainings',
    itemIds: ['t1', 't2'],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  } as any);

describe('useComparisonsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { user: { groupRoles: ['owner'] }, isAuthenticated: true };
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [makeComparison()], pagination: {} as any }
    });
  });

  it('pages through comparisons on the server, back to the first page when the sort changes', async () => {
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: { comparisons: [makeComparison()], pagination: { page: 1, limit: 50, total: 103, pages: 3 } }
    });
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalComparisons).toBe(103);
    expect(mockedComparison.getComparisons).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 50 }));

    act(() => result.current.handleChangePage(null, 2));
    await waitFor(() =>
      expect(mockedComparison.getComparisons).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3, limit: 50 }))
    );

    act(() => result.current.handleChangeRowsPerPage({ target: { value: '100' } } as React.ChangeEvent<HTMLInputElement>));
    await waitFor(() =>
      expect(mockedComparison.getComparisons).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 100 }))
    );

    act(() => result.current.handleChangePage(null, 1));
    act(() => result.current.handleSort('name'));
    await waitFor(() => expect(result.current.page).toBe(0));
  });

  it('loads comparisons on mount', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comparisons).toHaveLength(1);
  });

  it('asks the server to sort by item count, and shows its order as is', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mockedComparison.getComparisons.mockResolvedValue({
      success: true,
      data: {
        comparisons: [makeComparison({ _id: 'c1', itemIds: ['a', 'b', 'c'] }), makeComparison({ _id: 'c2', itemIds: ['a'] })],
        pagination: {} as any
      }
    });

    act(() => {
      result.current.handleSort('itemCount');
    });

    await waitFor(() =>
      expect(mockedComparison.getComparisons).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'itemCount', order: 'asc', page: 1 })
      )
    );
    await waitFor(() => expect(result.current.comparisons.map((c) => c._id)).toEqual(['c1', 'c2']));
  });

  it('handleSort toggles order when the same column is clicked twice', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sortBy).toBe('createdAt');
    expect(result.current.sortOrder).toBe('desc');

    act(() => {
      result.current.handleSort('createdAt');
    });
    expect(result.current.sortOrder).toBe('asc');

    act(() => {
      result.current.handleSort('name');
    });
    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('canDeleteComparisons is true for an owner/admin group member', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canDeleteComparisons('c1')).toBe(true);
  });

  it('canDeleteComparisons is false for an unauthenticated user', async () => {
    authState = { user: null, isAuthenticated: false };
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.canDeleteComparisons('c1')).toBe(false);
  });

  it('an authenticated editor need not hold a global group admin role', async () => {
    authState = { user: { groupRoles: ['member'] }, isAuthenticated: true };
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.canDeleteComparisons('c1')).toBe(true);
  });

  it('handleDeleteComparison opens the delete dialog, and handleConfirmDelete deletes + refetches', async () => {
    mockedComparison.deleteComparison.mockResolvedValue({ success: true, data: undefined });
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleDeleteComparison('c1');
    });
    expect(result.current.deleteDialogOpen).toBe(true);

    await act(async () => {
      await result.current.handleConfirmDelete();
    });

    await waitFor(() => expect(result.current.deleteDialogOpen).toBe(false));
    expect(mockedComparison.deleteComparison).toHaveBeenCalledWith('c1');
  });

  it('handleCancelDelete closes the dialog without deleting', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleDeleteComparison('c1');
    });
    act(() => {
      result.current.handleCancelDelete();
    });

    expect(result.current.deleteDialogOpen).toBe(false);
    expect(mockedComparison.deleteComparison).not.toHaveBeenCalled();
  });

  it('handleEditComparison prefills the edit form and loads training names for a trainings comparison', async () => {
    mockedTraining.getTrainings.mockResolvedValue({
      success: true,
      data: { trainings: [{ _id: 't1', name: 'Training One' }] as any, pagination: {} as any }
    });
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleEditComparison(makeComparison());
    });

    expect(result.current.editDialogOpen).toBe(true);
    expect(result.current.editName).toBe('Comparison 1');
    expect(result.current.trainingData).toEqual({ t1: 'Training One' });
  });

  it('asks for just the comparison\'s own trainings, by id', async () => {
    mockedTraining.getTrainings.mockResolvedValue({ success: true, data: { trainings: [], pagination: {} as any } });
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleEditComparison(makeComparison());
    });

    expect(mockedTraining.getTrainings).toHaveBeenCalledWith({ ids: ['t1', 't2'], limit: 2 });
  });

  it('handleEditComparison falls back to raw IDs when the training fetch fails', async () => {
    mockedTraining.getTrainings.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleEditComparison(makeComparison());
    });

    expect(result.current.trainingData).toEqual({ t1: 't1', t2: 't2' });
  });

  it('handleUpdateComparison updates and closes the dialog', async () => {
    mockedComparison.updateComparison.mockResolvedValue({ success: true, data: makeComparison() });
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleEditComparison(makeComparison());
    });
    act(() => {
      result.current.setEditName('Renamed');
    });

    await act(async () => {
      await result.current.handleUpdateComparison();
    });

    await waitFor(() => expect(result.current.editDialogOpen).toBe(false));
    expect(mockedComparison.updateComparison).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ name: 'Renamed' })
    );
  });

  it('handleEditTrainingIdToggle adds and removes ids', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.handleEditComparison(makeComparison());
    });

    act(() => {
      result.current.handleEditTrainingIdToggle('t3');
    });
    expect(result.current.editSelectedIds).toContain('t3');

    act(() => {
      result.current.handleEditTrainingIdToggle('t3');
    });
    expect(result.current.editSelectedIds).not.toContain('t3');
  });

  it('handleViewComparison navigates with the tab query param for tests/benchmarks', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleViewComparison(makeComparison({ type: 'tests', itemIds: ['t1'] }));
    });
    expect(navigateMock).toHaveBeenCalledWith('/trainings/compare?ids=t1&tab=tests');
  });

  it('formatTimestamp and getTypeColor produce expected output', async () => {
    const { result } = renderHook(() => useComparisonsPage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(typeof result.current.formatTimestamp('2026-01-01T00:00:00.000Z')).toBe('string');
    expect(result.current.getTypeColor('trainings')).toBe('primary');
    expect(result.current.getTypeColor('tests')).toBe('secondary');
    expect(result.current.getTypeColor('benchmarks')).toBe('success');
    expect(result.current.getTypeColor('epochs')).toBe('warning');
    expect(result.current.getTypeColor('unknown')).toBe('default');
  });
});
