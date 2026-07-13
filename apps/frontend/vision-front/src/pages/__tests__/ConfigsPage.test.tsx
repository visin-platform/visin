import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const useConfigsPageMock = vi.fn();
vi.mock('../../hooks/useConfigsPage', () => ({
  useConfigsPage: () => useConfigsPageMock()
}));

vi.mock('../../components/configs/ConfigsTable', () => ({
  default: (props: any) => (
    <div data-testid="configs-table">
      <span data-testid="configs-count">{props.configs.length}</span>
      <span data-testid="loading">{String(props.loading)}</span>
      <button onClick={() => props.onSelectConfig('c1')}>select-c1</button>
      <button onClick={() => props.onSelectAll(['c1', 'c2'])}>select-all</button>
      <button onClick={() => props.onViewDetails({ _id: 'c1', name: 'Config 1' })}>view-c1</button>
      <button onClick={() => props.onEdit({ _id: 'c1', name: 'Config 1' })}>edit-c1</button>
      <button onClick={() => props.onDelete({ _id: 'c1', name: 'Config 1' })}>delete-c1</button>
      <button onClick={() => props.onDeleteMultiple()}>delete-multiple</button>
    </div>
  )
}));

vi.mock('../../components/configs/ConfigDetailsDialog', () => ({
  default: (props: any) => (props.open ? <div data-testid="details-dialog">{props.config?.name}</div> : null)
}));

vi.mock('../../components/configs/EditConfigDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="edit-dialog">
        <button onClick={() => props.onSave()}>save-edit</button>
      </div>
    ) : null
}));

vi.mock('../../components/configs/DeleteConfigDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-dialog">
        <button onClick={() => props.onConfirm()}>confirm-delete</button>
      </div>
    ) : null
}));

vi.mock('../../components/configs/DeleteMultipleConfigsDialog', () => ({
  default: (props: any) =>
    props.open ? (
      <div data-testid="delete-multiple-dialog">
        <span data-testid="delete-count">{props.count}</span>
        <button onClick={() => props.onConfirm()}>confirm-delete-multiple</button>
      </div>
    ) : null
}));

vi.mock('../../components/configs/ConfigUploadButton', () => ({
  default: (props: any) => (
    <button data-testid="upload-button" disabled={props.uploading} onClick={() => props.onFileChange({} as any)}>
      Upload
    </button>
  )
}));

import ConfigsPage from '../ConfigsPage';

const baseHookReturn = () => ({
  configs: [],
  loading: false,
  error: null,
  setError: vi.fn(),
  success: null,
  setSuccess: vi.fn(),
  uploading: false,
  selectedConfigIds: new Set<string>(),
  deleteMultipleDialogOpen: false,
  setDeleteMultipleDialogOpen: vi.fn(),
  detailsDialogOpen: false,
  setDetailsDialogOpen: vi.fn(),
  selectedConfig: null,
  deleteDialogOpen: false,
  setDeleteDialogOpen: vi.fn(),
  editDialogOpen: false,
  setEditDialogOpen: vi.fn(),
  editingConfig: null,
  editConfigName: '',
  setEditConfigName: vi.fn(),
  fileInputRef: { current: null },
  handleFileChange: vi.fn(),
  handleViewDetails: vi.fn(),
  handleEditClick: vi.fn(),
  handleEditSave: vi.fn(),
  handleDeleteClick: vi.fn(),
  handleConfirmDelete: vi.fn(),
  handleSelectConfig: vi.fn(),
  handleSelectAll: vi.fn(),
  handleDeleteSelected: vi.fn(),
  handleRefresh: vi.fn()
});

describe('ConfigsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConfigsPageMock.mockReturnValue(baseHookReturn());
  });

  it('renders the configs table with an empty list', () => {
    render(<ConfigsPage />);
    expect(screen.getByTestId('configs-count').textContent).toBe('0');
    expect(screen.getByText('Configs Library')).toBeInTheDocument();
  });

  it('renders a loading state passed down to the table', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), loading: true });
    render(<ConfigsPage />);
    expect(screen.getByTestId('loading').textContent).toBe('true');
  });

  it('shows a success alert', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), success: 'Config saved' });
    render(<ConfigsPage />);
    expect(screen.getByText('Config saved')).toBeInTheDocument();
  });

  it('shows an error alert', () => {
    useConfigsPageMock.mockReturnValue({ ...baseHookReturn(), error: 'Failed to load configs' });
    render(<ConfigsPage />);
    expect(screen.getByText('Failed to load configs')).toBeInTheDocument();
  });

  it('populates the configs table with data', () => {
    useConfigsPageMock.mockReturnValue({
      ...baseHookReturn(),
      configs: [{ _id: 'c1', name: 'Config 1' }, { _id: 'c2', name: 'Config 2' }]
    });
    render(<ConfigsPage />);
    expect(screen.getByTestId('configs-count').textContent).toBe('2');
  });

  it('opens the delete-multiple dialog reflecting selected count', () => {
    const hookReturn = {
      ...baseHookReturn(),
      selectedConfigIds: new Set(['c1', 'c2']),
      deleteMultipleDialogOpen: true
    };
    useConfigsPageMock.mockReturnValue(hookReturn);
    render(<ConfigsPage />);
    expect(screen.getByTestId('delete-count').textContent).toBe('2');
    fireEvent.click(screen.getByText('confirm-delete-multiple'));
    expect(hookReturn.handleDeleteSelected).toHaveBeenCalled();
  });

  it('triggers view/edit/delete handlers from the table', () => {
    const hookReturn = baseHookReturn();
    useConfigsPageMock.mockReturnValue(hookReturn);
    render(<ConfigsPage />);
    fireEvent.click(screen.getByText('view-c1'));
    fireEvent.click(screen.getByText('edit-c1'));
    fireEvent.click(screen.getByText('delete-c1'));
    fireEvent.click(screen.getByText('select-c1'));
    fireEvent.click(screen.getByText('select-all'));
    expect(hookReturn.handleViewDetails).toHaveBeenCalledWith({ _id: 'c1', name: 'Config 1' });
    expect(hookReturn.handleEditClick).toHaveBeenCalledWith({ _id: 'c1', name: 'Config 1' });
    expect(hookReturn.handleDeleteClick).toHaveBeenCalledWith({ _id: 'c1', name: 'Config 1' });
    expect(hookReturn.handleSelectConfig).toHaveBeenCalledWith('c1');
    expect(hookReturn.handleSelectAll).toHaveBeenCalledWith(['c1', 'c2']);
  });

  it('calls handleRefresh when the refresh icon button is clicked', () => {
    const hookReturn = baseHookReturn();
    useConfigsPageMock.mockReturnValue(hookReturn);
    render(<ConfigsPage />);
    fireEvent.click(screen.getByRole('button', { name: '' }));
    expect(hookReturn.handleRefresh).toHaveBeenCalled();
  });
});
