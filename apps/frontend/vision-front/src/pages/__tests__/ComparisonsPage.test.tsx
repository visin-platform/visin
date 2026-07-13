import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useComparisonsPageMock = vi.fn();
vi.mock('../../hooks/useComparisonsPage', () => ({
  useComparisonsPage: () => useComparisonsPageMock()
}));

vi.mock('../../components/comparisons/ComparisonsTable', () => ({
  default: (props: any) => (
    <div data-testid="comparisons-table">
      <span data-testid="comparisons-count">{props.comparisons.length}</span>
      <button onClick={() => props.onSort('name')}>sort-name</button>
      <button onClick={() => props.onViewComparison('cmp1')}>view-cmp1</button>
      <button onClick={() => props.onEditComparison({ _id: 'cmp1' })}>edit-cmp1</button>
      <button onClick={() => props.onDeleteComparison('cmp1')}>delete-cmp1</button>
    </div>
  )
}));

vi.mock('../../components/comparisons/DeleteComparisonDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-dialog">
        <button onClick={() => props.onConfirm()}>confirm-delete</button>
        <button onClick={() => props.onClose()}>cancel-delete</button>
      </div>
    ) : null
}));

vi.mock('../../components/comparisons/EditComparisonDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="edit-dialog">
        <button onClick={() => props.onUpdate()}>confirm-update</button>
      </div>
    ) : null
}));

import ComparisonsPage from '../ComparisonsPage';

const theme = { palette: { divider: '#ccc', action: { hover: '#eee' } } };

const baseHookReturn = () => ({
  comparisons: [],
  loading: false,
  error: null,
  deleteDialogOpen: false,
  editDialogOpen: false,
  comparisonToEdit: null,
  editName: '',
  setEditName: vi.fn(),
  editDescription: '',
  setEditDescription: vi.fn(),
  editSelectedIds: [],
  updating: false,
  trainingData: [],
  loadingTrainings: false,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  theme,
  handleSort: vi.fn(),
  loadComparisons: vi.fn(),
  handleDeleteComparison: vi.fn(),
  handleConfirmDelete: vi.fn(),
  handleCancelDelete: vi.fn(),
  canDeleteComparisons: vi.fn().mockReturnValue(true),
  handleEditComparison: vi.fn(),
  handleCancelEdit: vi.fn(),
  handleUpdateComparison: vi.fn(),
  handleEditTrainingIdToggle: vi.fn(),
  handleViewComparison: vi.fn(),
  formatTimestamp: vi.fn().mockReturnValue('now'),
  getTypeColor: vi.fn().mockReturnValue('primary')
});

describe('ComparisonsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useComparisonsPageMock.mockReturnValue(baseHookReturn());
  });

  it('shows a full-page spinner when loading with no comparisons yet', () => {
    useComparisonsPageMock.mockReturnValue({ ...baseHookReturn(), loading: true, comparisons: [] });
    render(<ComparisonsPage />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Comparisons')).not.toBeInTheDocument();
  });

  it('renders the empty state when there are no comparisons', () => {
    render(<ComparisonsPage />);
    expect(screen.getByText('No comparisons found')).toBeInTheDocument();
  });

  it('renders an error alert', () => {
    useComparisonsPageMock.mockReturnValue({ ...baseHookReturn(), error: 'Failed to load comparisons' });
    render(<ComparisonsPage />);
    expect(screen.getByText('Failed to load comparisons')).toBeInTheDocument();
  });

  it('renders the comparisons table with populated data and no empty message', () => {
    useComparisonsPageMock.mockReturnValue({
      ...baseHookReturn(),
      comparisons: [{ _id: 'cmp1' }, { _id: 'cmp2' }]
    });
    render(<ComparisonsPage />);
    expect(screen.getByTestId('comparisons-count').textContent).toBe('2');
    expect(screen.queryByText('No comparisons found')).not.toBeInTheDocument();
  });

  it('calls loadComparisons when the refresh button is clicked', () => {
    const hookReturn = baseHookReturn();
    useComparisonsPageMock.mockReturnValue(hookReturn);
    render(<ComparisonsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(hookReturn.loadComparisons).toHaveBeenCalled();
  });

  it('wires table interactions (sort, view, edit, delete) to the hook handlers', () => {
    const hookReturn = { ...baseHookReturn(), comparisons: [{ _id: 'cmp1' }] };
    useComparisonsPageMock.mockReturnValue(hookReturn);
    render(<ComparisonsPage />);
    fireEvent.click(screen.getByText('sort-name'));
    fireEvent.click(screen.getByText('view-cmp1'));
    fireEvent.click(screen.getByText('edit-cmp1'));
    fireEvent.click(screen.getByText('delete-cmp1'));
    expect(hookReturn.handleSort).toHaveBeenCalledWith('name');
    expect(hookReturn.handleViewComparison).toHaveBeenCalledWith('cmp1');
    expect(hookReturn.handleEditComparison).toHaveBeenCalledWith({ _id: 'cmp1' });
    expect(hookReturn.handleDeleteComparison).toHaveBeenCalledWith('cmp1');
  });

  it('confirms delete via the delete dialog', () => {
    const hookReturn = { ...baseHookReturn(), deleteDialogOpen: true };
    useComparisonsPageMock.mockReturnValue(hookReturn);
    render(<ComparisonsPage />);
    fireEvent.click(screen.getByText('confirm-delete'));
    expect(hookReturn.handleConfirmDelete).toHaveBeenCalled();
  });

  it('confirms update via the edit dialog', () => {
    const hookReturn = { ...baseHookReturn(), editDialogOpen: true, comparisonToEdit: { _id: 'cmp1' } };
    useComparisonsPageMock.mockReturnValue(hookReturn);
    render(<ComparisonsPage />);
    fireEvent.click(screen.getByText('confirm-update'));
    expect(hookReturn.handleUpdateComparison).toHaveBeenCalled();
  });
});
