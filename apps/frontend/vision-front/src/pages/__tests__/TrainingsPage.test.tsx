import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useTrainingsPageMock = vi.fn();
vi.mock('../../hooks/useTrainingsPage', () => ({
  useTrainingsPage: () => useTrainingsPageMock()
}));

vi.mock('../../components/TrainingsTable', () => ({
  default: (props: any) => (
    <div data-testid="trainings-table">
      <span data-testid="trainings-count">{props.trainings.length}</span>
      <span data-testid="table-loading">{String(props.isLoading)}</span>
      <button onClick={() => props.onPageChange(1)}>next-page</button>
      <button onClick={() => props.onSort('name')}>sort-name</button>
      <button onClick={() => props.onEdit('t1')}>edit-t1</button>
      <button onClick={() => props.onDelete('t1')}>delete-t1</button>
      <button onClick={() => props.onSelectTraining('t1')}>select-t1</button>
      <button onClick={() => props.onSelectAll(['t1', 't2'])}>select-all</button>
    </div>
  )
}));

vi.mock('../../components/TrainingFilters', () => ({
  default: (props: any) => (
    <div data-testid="training-filters">
      <input
        aria-label="search"
        value={props.searchTerm}
        onChange={(e) => props.onSearchChange(e.target.value)}
      />
    </div>
  )
}));

vi.mock('../../components/TrainingFormDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="training-form-dialog">
        <button onClick={() => props.onSubmit()}>submit-training</button>
      </div>
    ) : null
}));

vi.mock('../../components/trainings/BulkActionsBar', () => ({
  default: (props: any) => (
    <div data-testid="bulk-actions">
      <span data-testid="selected-count">{props.selectedCount}</span>
      <button onClick={() => props.onExport()}>export</button>
      <button onClick={() => props.onCompare()}>compare</button>
      <button onClick={() => props.onDelete()}>bulk-delete</button>
    </div>
  )
}));

vi.mock('../../components/trainings/DeleteTrainingDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-training-dialog">
        <button onClick={() => props.onConfirm()}>confirm-delete</button>
      </div>
    ) : null
}));

vi.mock('../../components/trainings/DeleteMultipleTrainingsDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-multiple-dialog">
        <span data-testid="delete-count">{props.count}</span>
        <button onClick={() => props.onConfirm()}>confirm-delete-multiple</button>
      </div>
    ) : null
}));

vi.mock('../../components/common/PageBreadcrumbs', () => ({
  default: () => <div data-testid="breadcrumbs" />
}));

import TrainingsPage from '../TrainingsPage';

const baseHookReturn = () => ({
  isAuthenticated: true,
  page: 0,
  rowsPerPage: 100,
  searchTerm: '',
  setSearchTerm: vi.fn(),
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  createModalOpen: false,
  trainingName: '',
  setTrainingName: vi.fn(),
  trainingDescription: '',
  setTrainingDescription: vi.fn(),
  selectedDatasetId: '',
  setSelectedDatasetId: vi.fn(),
  selectedConfigId: '',
  setSelectedConfigId: vi.fn(),
  selectedProjectId: '',
  setSelectedProjectId: vi.fn(),
  selectedStatus: 'pending',
  setSelectedStatus: vi.fn(),
  trainingTags: [],
  setTrainingTags: vi.fn(),
  datasets: [],
  configs: [],
  projects: [],
  loadingDatasets: false,
  loadingConfigs: false,
  loadingProjects: false,
  creating: false,
  createError: null,
  createSuccess: null,
  editingTrainingId: null,
  deleteDialogOpen: false,
  setDeleteDialogOpen: vi.fn(),
  selectedTrainingIds: new Set<string>(),
  deleteMultipleDialogOpen: false,
  setDeleteMultipleDialogOpen: vi.fn(),
  selectedTags: [],
  setSelectedTags: vi.fn(),
  availableTags: [],
  excludedTags: [],
  setExcludedTags: vi.fn(),
  isLoading: false,
  error: null,
  displayTrainings: [],
  totalCount: 0,
  exportToCSV: vi.fn(),
  handleChangePage: vi.fn(),
  handleChangeRowsPerPage: vi.fn(),
  handleSort: vi.fn(),
  handleCreateTraining: vi.fn(),
  handleCloseModal: vi.fn(),
  handleEditTraining: vi.fn(),
  handleDeleteClick: vi.fn(),
  handleConfirmDelete: vi.fn(),
  handleSelectTraining: vi.fn(),
  handleSelectAll: vi.fn(),
  handleCompareSelected: vi.fn(),
  handleDeleteSelected: vi.fn()
});

describe('TrainingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTrainingsPageMock.mockReturnValue(baseHookReturn());
  });

  it('renders an empty trainings table by default', () => {
    render(<TrainingsPage />);
    expect(screen.getByTestId('trainings-count').textContent).toBe('0');
  });

  it('shows a loading state on the table', () => {
    useTrainingsPageMock.mockReturnValue({ ...baseHookReturn(), isLoading: true });
    render(<TrainingsPage />);
    expect(screen.getByTestId('table-loading').textContent).toBe('true');
  });

  it('shows an error alert with the error message', () => {
    useTrainingsPageMock.mockReturnValue({ ...baseHookReturn(), error: new Error('Failed to load training runs') });
    render(<TrainingsPage />);
    expect(screen.getByText('Failed to load training runs')).toBeInTheDocument();
  });

  it('renders populated trainings and reflects selection count', () => {
    useTrainingsPageMock.mockReturnValue({
      ...baseHookReturn(),
      displayTrainings: [{ _id: 't1' }, { _id: 't2' }],
      totalCount: 2,
      selectedTrainingIds: new Set(['t1'])
    });
    render(<TrainingsPage />);
    expect(screen.getByTestId('trainings-count').textContent).toBe('2');
    expect(screen.getByTestId('selected-count').textContent).toBe('1');
  });

  it('wires table interactions to the hook handlers', () => {
    const hookReturn = baseHookReturn();
    useTrainingsPageMock.mockReturnValue(hookReturn);
    render(<TrainingsPage />);
    fireEvent.click(screen.getByText('next-page'));
    fireEvent.click(screen.getByText('sort-name'));
    fireEvent.click(screen.getByText('edit-t1'));
    fireEvent.click(screen.getByText('delete-t1'));
    fireEvent.click(screen.getByText('select-t1'));
    fireEvent.click(screen.getByText('select-all'));
    expect(hookReturn.handleChangePage).toHaveBeenCalledWith(1);
    expect(hookReturn.handleSort).toHaveBeenCalledWith('name');
    expect(hookReturn.handleEditTraining).toHaveBeenCalledWith('t1');
    expect(hookReturn.handleDeleteClick).toHaveBeenCalledWith('t1');
    expect(hookReturn.handleSelectTraining).toHaveBeenCalledWith('t1');
    expect(hookReturn.handleSelectAll).toHaveBeenCalledWith(['t1', 't2']);
  });

  it('wires the bulk actions bar (export, compare, delete)', () => {
    const hookReturn = baseHookReturn();
    useTrainingsPageMock.mockReturnValue(hookReturn);
    render(<TrainingsPage />);
    fireEvent.click(screen.getByText('export'));
    fireEvent.click(screen.getByText('compare'));
    fireEvent.click(screen.getByText('bulk-delete'));
    expect(hookReturn.exportToCSV).toHaveBeenCalled();
    expect(hookReturn.handleCompareSelected).toHaveBeenCalled();
    expect(hookReturn.setDeleteMultipleDialogOpen).toHaveBeenCalledWith(true);
  });

  it('opens the create/edit training dialog and submits', () => {
    const hookReturn = { ...baseHookReturn(), createModalOpen: true };
    useTrainingsPageMock.mockReturnValue(hookReturn);
    render(<TrainingsPage />);
    fireEvent.click(screen.getByText('submit-training'));
    expect(hookReturn.handleCreateTraining).toHaveBeenCalled();
  });

  it('confirms single delete via the delete dialog', () => {
    const hookReturn = { ...baseHookReturn(), deleteDialogOpen: true };
    useTrainingsPageMock.mockReturnValue(hookReturn);
    render(<TrainingsPage />);
    fireEvent.click(screen.getByText('confirm-delete'));
    expect(hookReturn.handleConfirmDelete).toHaveBeenCalled();
  });

  it('confirms multiple delete reflecting the selected count', () => {
    const hookReturn = {
      ...baseHookReturn(),
      deleteMultipleDialogOpen: true,
      selectedTrainingIds: new Set(['t1', 't2', 't3'])
    };
    useTrainingsPageMock.mockReturnValue(hookReturn);
    render(<TrainingsPage />);
    expect(screen.getByTestId('delete-count').textContent).toBe('3');
    fireEvent.click(screen.getByText('confirm-delete-multiple'));
    expect(hookReturn.handleDeleteSelected).toHaveBeenCalled();
  });
});
